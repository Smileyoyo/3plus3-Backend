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
    const { level, status, search } = req.query;
    
    let sql = 'SELECT * FROM vips WHERE 1=1';
    const params = [];

    if (level) {
      sql += ' AND level = ?';
      params.push(level);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (nickname LIKE ? OR kook_id LIKE ? OR wechat LIKE ? OR phone LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
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
        level_info: config.vipLevels[v.level]
      })),
      total,
      page,
      pageSize
    ));
  } catch (err) {
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
    vip.level_info = config.vipLevels[vip.level];

    // 获取该VIP的订单记录
    const orders = db.all(`
      SELECT * FROM orders
      WHERE boss_kook_id = ? OR boss_wechat = ?
      ORDER BY created_at DESC
      LIMIT 10
    `, vip.kook_id, vip.wechat);

    res.json(response(200, '获取成功', { ...vip, orders }));
  } catch (err) {
    res.json(response(500, '获取VIP详情失败'));
  }
});

// POST / - 创建VIP
router.post('/', (req, res) => {
  try {
    const db = getDatabase();
    const { nickname, kook_id, wechat, phone, level, tags } = req.body;

    if (!nickname) {
      return res.json(response(400, '昵称不能为空'));
    }

    const result = db.run(`
      INSERT INTO vips (nickname, kook_id, wechat, phone, level, tags)
      VALUES (?, ?, ?, ?, ?, ?)
    `, nickname, kook_id, wechat, phone, level || 1, JSON.stringify(tags || []));
    
    const vip = db.get('SELECT * FROM vips WHERE id = ?', result.lastInsertRowid);
    vip.tags = parseJsonField(vip.tags);
    vip.level_info = config.vipLevels[vip.level];

    res.json(response(200, 'VIP创建成功', vip));
  } catch (err) {
    res.json(response(500, '创建VIP失败'));
  }
});

// PUT /:id - 更新VIP
router.put('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const { nickname, kook_id, wechat, phone, level, tags, status } = req.body;
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
    if (kook_id !== undefined) {
      updateFields.push('kook_id = ?');
      params.push(kook_id);
    }
    if (wechat !== undefined) {
      updateFields.push('wechat = ?');
      params.push(wechat);
    }
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      params.push(phone);
    }
    if (level !== undefined) {
      updateFields.push('level = ?');
      params.push(level);
    }
    if (tags !== undefined) {
      updateFields.push('tags = ?');
      params.push(JSON.stringify(tags));
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      params.push(status);
    }

    updateFields.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.run(`UPDATE vips SET ${updateFields.join(', ')} WHERE id = ?`, ...params);

    const updated = db.get('SELECT * FROM vips WHERE id = ?', req.params.id);
    updated.tags = parseJsonField(updated.tags);
    updated.level_info = config.vipLevels[updated.level];

    res.json(response(200, '更新成功', updated));
  } catch (err) {
    res.json(response(500, '更新VIP失败'));
  }
});

// POST /:id/recharge - VIP充值
router.post('/:id/recharge', (req, res) => {
  try {
    const db = getDatabase();
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.json(response(400, '请输入有效的充值金额'));
    }

    const vip = db.get('SELECT * FROM vips WHERE id = ?', req.params.id);
    if (!vip) {
      return res.json(response(404, 'VIP不存在'));
    }

    // 更新余额和累计充值
    db.run(`
      UPDATE vips 
      SET balance = balance + ?,
          total_recharge = total_recharge + ?,
          updated_at = datetime('now')
      WHERE id = ?
    `, amount, amount, req.params.id);

    // 自动升级VIP等级
    const newLevel = calculateVipLevel(vip.total_recharge + amount);
    if (newLevel > vip.level) {
      db.run('UPDATE vips SET level = ? WHERE id = ?', newLevel, req.params.id);
    }

    const updated = db.get('SELECT * FROM vips WHERE id = ?', req.params.id);
    updated.tags = parseJsonField(updated.tags);
    updated.level_info = config.vipLevels[updated.level];

    res.json(response(200, '充值成功', updated));
  } catch (err) {
    res.json(response(500, '充值失败'));
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
