const express = require('express');
const router = express.Router();
const { getDatabase } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { response, paginatedResponse, parseJsonField } = require('../utils/helpers');
const config = require('../config');

// 所有路由需要认证
router.use(authMiddleware);

// GET /levels - VIP等级列表
router.get('/levels', (req, res) => {
  const levels = Object.entries(config.vipLevels).map(([id, info]) => ({
    id: parseInt(id),
    ...info
  }));
  res.json(response(200, '获取成功', levels));
});

// GET / - VIP列表
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const { level, keyword } = req.query;
    
    let sql = 'SELECT * FROM vips WHERE 1=1';
    const params = [];

    if (level) {
      sql += ' AND level = ?';
      params.push(level);
    }
    if (keyword) {
      sql += ' AND (nickname LIKE ? OR phone LIKE ?)';
      const searchPattern = `%${keyword}%`;
      params.push(searchPattern, searchPattern);
    }

    sql += ' ORDER BY level DESC, created_at DESC';

    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    const totalResult = db.get(countSql, ...params);
    const total = totalResult ? totalResult.count : 0;

    sql += ' LIMIT ? OFFSET ?';
    params.push(pageSize, offset);
    const vips = db.all(sql, ...params);

    res.json(paginatedResponse(
      vips.map(v => ({
        ...v,
        tags: parseJsonField(v.tags),
        totalRecharge: v.total_recharge,
        totalSpent: v.total_spent || 0,
        totalOrders: v.total_orders,
        levelInfo: config.vipLevels[v.level]
      })),
      total,
      page,
      pageSize
    ));
  } catch (err) {
    console.error('获取VIP列表失败:', err);
    res.json(response(500, '获取VIP列表失败'));
  }
});

// GET /:id - VIP详情
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const vip = db.get('SELECT * FROM vips WHERE id = ?', req.params.id);
    
    if (!vip) {
      return res.json(response(404, 'VIP不存在'));
    }

    vip.tags = parseJsonField(vip.tags);
    vip.levelInfo = config.vipLevels[vip.level];

    // 获取该VIP的订单记录
    const orders = db.all(`
      SELECT * FROM orders
      WHERE vip_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `, vip.id);

    res.json(response(200, '获取成功', { 
      ...vip, 
      totalRecharge: vip.total_recharge,
      totalSpent: vip.total_spent || 0,
      totalOrders: vip.total_orders,
      orders 
    }));
  } catch (err) {
    res.json(response(500, '获取VIP详情失败'));
  }
});

// POST / - 创建VIP
router.post('/', (req, res) => {
  try {
    const db = getDatabase();
    const { nickname, phone, level, balance, remark } = req.body;

    if (!nickname) {
      return res.json(response(400, '昵称不能为空'));
    }

    const result = db.run(`
      INSERT INTO vips (nickname, phone, level, balance, remark, total_recharge)
      VALUES (?, ?, ?, ?, ?, ?)
    `, nickname, phone, level || 1, balance || 0, remark || null, balance || 0);
    
    const vip = db.get('SELECT * FROM vips WHERE id = ?', result.lastInsertRowid);

    res.json(response(200, 'VIP创建成功', {
      ...vip,
      totalRecharge: vip.total_recharge,
      totalSpent: vip.total_spent || 0,
      totalOrders: vip.total_orders
    }));
  } catch (err) {
    console.error('创建VIP失败:', err);
    res.json(response(500, '创建VIP失败'));
  }
});

// PUT /:id - 更新VIP
router.put('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const { nickname, phone, level, balance, remark, status } = req.body;
    const vip = db.get('SELECT * FROM vips WHERE id = ?', req.params.id);
    
    if (!vip) {
      return res.json(response(404, 'VIP不存在'));
    }

    const updateFields = [];
    const params = [];

    if (nickname !== undefined) {
      updateFields.push('nickname = ?');
      params.push(nickname);
    }
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      params.push(phone);
    }
    if (level !== undefined) {
      updateFields.push('level = ?');
      params.push(level);
    }
    if (balance !== undefined) {
      updateFields.push('balance = ?');
      params.push(balance);
    }
    if (remark !== undefined) {
      updateFields.push('remark = ?');
      params.push(remark);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      params.push(status);
    }

    updateFields.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.run(`UPDATE vips SET ${updateFields.join(', ')} WHERE id = ?`, ...params);

    const updated = db.get('SELECT * FROM vips WHERE id = ?', req.params.id);

    res.json(response(200, '更新成功', {
      ...updated,
      totalRecharge: updated.total_recharge,
      totalSpent: updated.total_spent || 0,
      totalOrders: updated.total_orders
    }));
  } catch (err) {
    res.json(response(500, '更新VIP失败'));
  }
});

// POST /:id/recharge - VIP充值
router.post('/:id/recharge', (req, res) => {
  try {
    const db = getDatabase();
    const { amount, type } = req.body;

    if (!amount || amount <= 0) {
      return res.json(response(400, '请输入有效的充值金额'));
    }

    const vip = db.get('SELECT * FROM vips WHERE id = ?', req.params.id);
    if (!vip) {
      return res.json(response(404, 'VIP不存在'));
    }

    // 更新余额和累计充值
    const newBalance = vip.balance + amount;
    const newTotalRecharge = vip.total_recharge + amount;
    
    db.run(`
      UPDATE vips 
      SET balance = ?,
          total_recharge = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `, newBalance, newTotalRecharge, req.params.id);

    // 自动升级VIP等级
    const newLevel = calculateVipLevel(newTotalRecharge);
    if (newLevel > vip.level) {
      db.run('UPDATE vips SET level = ? WHERE id = ?', newLevel, req.params.id);
    }

    const updated = db.get('SELECT * FROM vips WHERE id = ?', req.params.id);

    res.json(response(200, '充值成功', {
      ...updated,
      totalRecharge: updated.total_recharge,
      totalSpent: updated.total_spent || 0,
      totalOrders: updated.total_orders
    }));
  } catch (err) {
    console.error('充值失败:', err);
    res.json(response(500, '充值失败'));
  }
});

// POST /:id/upgrade - VIP升级
router.post('/:id/upgrade', (req, res) => {
  try {
    const db = getDatabase();
    const { level } = req.body;

    if (!level || level < 1 || level > 5) {
      return res.json(response(400, '无效的等级'));
    }

    const vip = db.get('SELECT * FROM vips WHERE id = ?', req.params.id);
    if (!vip) {
      return res.json(response(404, 'VIP不存在'));
    }

    db.run('UPDATE vips SET level = ?, updated_at = datetime(\'now\') WHERE id = ?', level, req.params.id);

    const updated = db.get('SELECT * FROM vips WHERE id = ?', req.params.id);

    res.json(response(200, '升级成功', {
      ...updated,
      totalRecharge: updated.total_recharge,
      totalSpent: updated.total_spent || 0,
      totalOrders: updated.total_orders
    }));
  } catch (err) {
    res.json(response(500, '升级失败'));
  }
});

// 计算VIP等级
function calculateVipLevel(totalRecharge) {
  let level = 1;
  for (const [lvl, info] of Object.entries(config.vipLevels)) {
    if (totalRecharge >= info.minRecharge) {
      level = parseInt(lvl);
    }
  }
  return level;
}

// DELETE /:id - 删除VIP
router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const vip = db.get('SELECT * FROM vips WHERE id = ?', req.params.id);
    if (!vip) {
      return res.json(response(404, 'VIP不存在'));
    }

    db.run('DELETE FROM vips WHERE id = ?', req.params.id);
    res.json(response(200, '删除成功'));
  } catch (err) {
    res.json(response(500, '删除VIP失败'));
  }
});

module.exports = router;
