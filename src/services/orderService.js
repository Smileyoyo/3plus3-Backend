const { getDatabase } = require('../models/database');
const { generateOrderNo, parseJsonField, calculateSettlement } = require('../utils/helpers');
const config = require('../config');

class OrderService {
  /**
   * 创建订单
   */
  createOrder(data) {
    const db = getDatabase();
    const orderNo = generateOrderNo();
    
    const result = db.run(`
      INSERT INTO orders (order_no, game_type, boss_kook_id, boss_wechat, amount, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `, orderNo, data.game_type, data.boss_kook_id || null, data.boss_wechat || null, data.amount);
    
    return this.getOrderById(result.lastInsertRowid);
  }

  /**
   * 获取订单列表
   */
  getOrders(filters = {}) {
    const db = getDatabase();
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params = [];

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.gameType) {
      sql += ' AND game_type = ?';
      params.push(filters.gameType);
    }
    if (filters.startDate) {
      sql += ' AND created_at >= ?';
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      sql += ' AND created_at <= ?';
      params.push(filters.endDate);
    }

    sql += ' ORDER BY created_at DESC';

    // 分页
    const page = parseInt(filters.page) || 1;
    const pageSize = parseInt(filters.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    // 获取总数
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    const totalResult = db.get(countSql, ...params);
    const total = totalResult ? totalResult.count : 0;

    // 获取分页数据
    sql += ' LIMIT ? OFFSET ?';
    params.push(pageSize, offset);
    const orders = db.all(sql, ...params);

    return {
      list: orders.map(o => ({
        ...o,
        player_ids: parseJsonField(o.player_ids)
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  /**
   * 获取单个订单
   */
  getOrderById(id) {
    const db = getDatabase();
    const order = db.get('SELECT * FROM orders WHERE id = ?', id);
    if (order) {
      order.player_ids = parseJsonField(order.player_ids);
    }
    return order;
  }

  /**
   * 更新订单（乐观锁）
   */
  updateOrder(id, data, expectedVersion) {
    const db = getDatabase();
    const updateFields = [];
    const params = [];

    if (data.game_type !== undefined) {
      updateFields.push('game_type = ?');
      params.push(data.game_type);
    }
    if (data.boss_kook_id !== undefined) {
      updateFields.push('boss_kook_id = ?');
      params.push(data.boss_kook_id);
    }
    if (data.boss_wechat !== undefined) {
      updateFields.push('boss_wechat = ?');
      params.push(data.boss_wechat);
    }
    if (data.amount !== undefined) {
      updateFields.push('amount = ?');
      params.push(data.amount);
    }
    if (data.status !== undefined) {
      updateFields.push('status = ?');
      params.push(data.status);
    }
    if (data.player_ids !== undefined) {
      updateFields.push('player_ids = ?');
      params.push(JSON.stringify(data.player_ids));
    }
    if (data.assign_time !== undefined) {
      updateFields.push('assign_time = ?');
      params.push(data.assign_time);
    }
    if (data.complete_time !== undefined) {
      updateFields.push('complete_time = ?');
      params.push(data.complete_time);
    }
    if (data.cancel_reason !== undefined) {
      updateFields.push('cancel_reason = ?');
      params.push(data.cancel_reason);
    }

    updateFields.push('version = version + 1');
    updateFields.push("updated_at = datetime('now')");

    params.push(id, expectedVersion);

    const result = db.run(`
      UPDATE orders SET ${updateFields.join(', ')}
      WHERE id = ? AND version = ?
    `, ...params);
    
    if (result.changes === 0) {
      throw new Error('版本号不匹配，数据已被修改');
    }

    return this.getOrderById(id);
  }

  /**
   * 派单
   */
  assignOrder(id, playerIds, expectedVersion) {
    return this.updateOrder(id, {
      status: 'assigned',
      player_ids: playerIds,
      assign_time: new Date().toISOString()
    }, expectedVersion);
  }

  /**
   * 完成订单
   */
  completeOrder(id, expectedVersion) {
    const db = getDatabase();
    const order = this.getOrderById(id);
    if (!order) {
      throw new Error('订单不存在');
    }
    
    const result = this.updateOrder(id, {
      status: 'completed',
      complete_time: new Date().toISOString()
    }, expectedVersion);

    // 更新打手统计
    if (order.player_ids) {
      const playerIds = parseJsonField(order.player_ids);
      playerIds.forEach(playerId => {
        db.run(`
          UPDATE players 
          SET total_orders = total_orders + 1,
              pending_settlement = pending_settlement + ?
          WHERE id = ?
        `, order.amount / playerIds.length, playerId);
      });
    }

    return result;
  }

  /**
   * 取消订单
   */
  cancelOrder(id, reason, expectedVersion) {
    return this.updateOrder(id, {
      status: 'cancelled',
      cancel_reason: reason
    }, expectedVersion);
  }

  /**
   * 删除订单
   */
  deleteOrder(id) {
    const db = getDatabase();
    db.run('DELETE FROM orders WHERE id = ?', id);
    return { success: true };
  }
}

module.exports = new OrderService();
