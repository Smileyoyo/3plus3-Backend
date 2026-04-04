const { getDatabase } = require('../models/database');
const { calculateSettlement, parseJsonField } = require('../utils/helpers');
const config = require('../config');
const lockService = require('./lockService');

class SettlementService {
  /**
   * 创建结算（基于订单）
   */
  createSettlement(orderId, playerId) {
    const db = getDatabase();
    const order = db.get('SELECT * FROM orders WHERE id = ?', orderId);
    if (!order) {
      throw new Error('订单不存在');
    }

    const playerIds = parseJsonField(order.player_ids);
    if (!playerIds.includes(playerId)) {
      throw new Error('该打手未参与此订单');
    }

    // 计算结算金额（按人头均分）
    const shareAmount = order.amount / playerIds.length;
    const settlement = calculateSettlement(shareAmount, config.settlement);

    const result = db.run(`
      INSERT INTO settlements (order_id, player_id, gross_amount, studio_fee, manager_fee, net_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `, orderId, playerId, settlement.gross_amount, settlement.studio_fee, settlement.manager_fee, settlement.net_amount);

    return this.getSettlementById(result.lastInsertRowid);
  }

  /**
   * 批量创建结算（订单完成时）
   */
  batchCreateSettlements(orderId) {
    const db = getDatabase();
    const order = db.get('SELECT * FROM orders WHERE id = ?', orderId);
    if (!order) {
      throw new Error('订单不存在');
    }

    const playerIds = parseJsonField(order.player_ids);
    const settlements = [];

    try {
      playerIds.forEach(playerId => {
        const shareAmount = order.amount / playerIds.length;
        const settlement = calculateSettlement(shareAmount, config.settlement);

        const result = db.run(`
          INSERT INTO settlements (order_id, player_id, gross_amount, studio_fee, manager_fee, net_amount, status)
          VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `, orderId, playerId, settlement.gross_amount, settlement.studio_fee, settlement.manager_fee, settlement.net_amount);

        settlements.push(result.lastInsertRowid);

        // 更新打手待结算金额
        db.run(`
          UPDATE players SET pending_settlement = pending_settlement - ? WHERE id = ?
        `, settlement.net_amount, playerId);
      });
    } catch (err) {
      throw err;
    }

    return settlements;
  }

  /**
   * 获取结算列表
   */
  getSettlements(filters = {}) {
    const db = getDatabase();
    let sql = `
      SELECT s.*, p.nickname as player_nickname, o.order_no, o.game_type
      FROM settlements s
      LEFT JOIN players p ON s.player_id = p.id
      LEFT JOIN orders o ON s.order_id = o.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.status) {
      sql += ' AND s.status = ?';
      params.push(filters.status);
    }
    if (filters.player_id) {
      sql += ' AND s.player_id = ?';
      params.push(filters.player_id);
    }
    if (filters.startDate) {
      sql += ' AND s.created_at >= ?';
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      sql += ' AND s.created_at <= ?';
      params.push(filters.endDate);
    }

    sql += ' ORDER BY s.created_at DESC';

    const page = parseInt(filters.page) || 1;
    const pageSize = parseInt(filters.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    const countSql = sql.replace(/SELECT s\.\*, p\.nickname.*?FROM/, 'SELECT COUNT(*) as count FROM');
    const totalResult = db.get(countSql, ...params);
    const total = totalResult ? totalResult.count : 0;

    sql += ' LIMIT ? OFFSET ?';
    params.push(pageSize, offset);
    const settlements = db.all(sql, ...params);

    return {
      list: settlements,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  /**
   * 获取单个结算
   */
  getSettlementById(id) {
    const db = getDatabase();
    return db.get(`
      SELECT s.*, p.nickname as player_nickname, o.order_no, o.game_type
      FROM settlements s
      LEFT JOIN players p ON s.player_id = p.id
      LEFT JOIN orders o ON s.order_id = o.id
      WHERE s.id = ?
    `, id);
  }

  /**
   * 审核结算
   */
  approveSettlement(id, operatorId) {
    const db = getDatabase();
    const settlement = this.getSettlementById(id);
    if (!settlement) {
      throw new Error('结算记录不存在');
    }
    if (settlement.status !== 'pending') {
      throw new Error('只有待审核状态可以审核');
    }

    db.run(`
      UPDATE settlements SET status = 'approved', approved_by = ?
      WHERE id = ?
    `, operatorId, id);

    // 记录日志
    this.addLog(id, settlement.order_id, settlement.player_id, operatorId, 'approve', settlement.net_amount, null, settlement.net_amount, '审核通过');

    return this.getSettlementById(id);
  }

  /**
   * 执行结算付款（悲观锁）
   */
  paySettlement(id, operatorId) {
    const db = getDatabase();
    // 获取锁
    const lockResult = lockService.acquireLock(id, `settlement_${operatorId}`);
    if (!lockResult.success) {
      throw new Error(lockResult.message);
    }

    try {
      const settlement = this.getSettlementById(id);
      if (!settlement) {
        throw new Error('结算记录不存在');
      }
      if (settlement.status !== 'approved') {
        throw new Error('只有已审核状态可以执行付款');
      }

      const beforeAmount = settlement.net_amount;

      // 更新结算状态
      db.run(`
        UPDATE settlements SET status = 'paid', paid_at = datetime('now')
        WHERE id = ? AND status = 'approved'
      `, id);

      // 更新打手收益
      db.run(`
        UPDATE players 
        SET total_earnings = total_earnings + ?,
            pending_settlement = pending_settlement - ?
        WHERE id = ?
      `, settlement.net_amount, settlement.net_amount, settlement.player_id);

      // 记录日志
      this.addLog(id, settlement.order_id, settlement.player_id, operatorId, 'pay', settlement.net_amount, beforeAmount, settlement.net_amount, '执行付款');

      return this.getSettlementById(id);
    } catch (err) {
      throw err;
    } finally {
      lockService.releaseLock(id, `settlement_${operatorId}`);
    }
  }

  /**
   * 添加鸡腿
   */
  addTips(id, tipsAmount, operatorId, remark) {
    const db = getDatabase();
    const settlement = this.getSettlementById(id);
    if (!settlement) {
      throw new Error('结算记录不存在');
    }

    const beforeAmount = settlement.net_amount;
    const afterAmount = settlement.net_amount + tipsAmount;

    db.run(`
      UPDATE settlements 
      SET tips = tips + ?, net_amount = net_amount + ?
      WHERE id = ?
    `, tipsAmount, tipsAmount, id);

    // 记录日志
    this.addLog(id, settlement.order_id, settlement.player_id, operatorId, 'tips', tipsAmount, beforeAmount, afterAmount, remark || '添加鸡腿');

    return this.getSettlementById(id);
  }

  /**
   * 修改结算金额
   */
  modifyAmount(id, newAmount, operatorId, remark) {
    const db = getDatabase();
    const settlement = this.getSettlementById(id);
    if (!settlement) {
      throw new Error('结算记录不存在');
    }
    if (settlement.status === 'paid') {
      throw new Error('已付款的结算不能修改');
    }

    const beforeAmount = settlement.net_amount;
    const diff = newAmount - settlement.net_amount;

    // 重新计算各部分
    const studioFee = newAmount * config.settlement.studioFeeRate;
    const managerFee = newAmount * config.settlement.managerFeeRate;
    const netAmount = newAmount - studioFee - managerFee;

    db.run(`
      UPDATE settlements 
      SET gross_amount = ?, studio_fee = ?, manager_fee = ?, net_amount = ?
      WHERE id = ?
    `, newAmount, studioFee, managerFee, netAmount, id);

    // 更新打手待结算金额
    db.run(`
      UPDATE players SET pending_settlement = pending_settlement + ?
      WHERE id = ?
    `, diff, settlement.player_id);

    // 记录日志
    this.addLog(id, settlement.order_id, settlement.player_id, operatorId, 'modify', diff, beforeAmount, netAmount, remark || '修改结算金额');

    return this.getSettlementById(id);
  }

  /**
   * 添加日志
   */
  addLog(settlementId, orderId, playerId, operatorId, action, amount, beforeAmount, afterAmount, remark) {
    const db = getDatabase();
    db.run(`
      INSERT INTO settlement_logs (settlement_id, order_id, player_id, operator_id, action, amount, before_amount, after_amount, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, settlementId, orderId, playerId, operatorId, action, amount, beforeAmount, afterAmount, remark);
  }

  /**
   * 获取结算日志
   */
  getLogs(filters = {}) {
    const db = getDatabase();
    let sql = `
      SELECT sl.*, p.nickname as player_nickname, u.nickname as operator_nickname, o.order_no
      FROM settlement_logs sl
      LEFT JOIN players p ON sl.player_id = p.id
      LEFT JOIN users u ON sl.operator_id = u.id
      LEFT JOIN orders o ON sl.order_id = o.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.settlement_id) {
      sql += ' AND sl.settlement_id = ?';
      params.push(filters.settlement_id);
    }
    if (filters.player_id) {
      sql += ' AND sl.player_id = ?';
      params.push(filters.player_id);
    }

    sql += ' ORDER BY sl.created_at DESC';

    const page = parseInt(filters.page) || 1;
    const pageSize = parseInt(filters.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    const countSql = sql.replace(/SELECT sl\.\*, p\.nickname.*?FROM/, 'SELECT COUNT(*) as count FROM');
    const totalResult = db.get(countSql, ...params);
    const total = totalResult ? totalResult.count : 0;

    sql += ' LIMIT ? OFFSET ?';
    params.push(pageSize, offset);

    return {
      list: db.all(sql, ...params),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }
}

module.exports = new SettlementService();
