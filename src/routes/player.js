const express = require('express');
const router = express.Router();
const { getDatabase } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { response, paginatedResponse, parseJsonField } = require('../utils/helpers');
const { getWebSocketServer } = require('../websocket');

// 所有路由需要认证
router.use(authMiddleware);

// GET / - 打手列表
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const { status, skills } = req.query;
    
    let sql = 'SELECT * FROM players WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (skills) {
      sql += ' AND skills LIKE ?';
      params.push(`%${skills}%`);
    }

    sql += ' ORDER BY created_at DESC';

    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    const totalResult = db.get(countSql, ...params);
    const total = totalResult ? totalResult.count : 0;

    sql += ' LIMIT ? OFFSET ?';
    params.push(pageSize, offset);
    const players = db.all(sql, ...params);

    res.json(paginatedResponse(
      players.map(p => ({ ...p, skills: parseJsonField(p.skills) })),
      total,
      page,
      pageSize
    ));
  } catch (err) {
    res.json(response(500, '获取打手列表失败'));
  }
});

// GET /stats - 打手统计
router.get('/stats', (req, res) => {
  try {
    const db = getDatabase();
    const stats = db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_count,
        SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as busy_count,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline_count,
        SUM(total_orders) as total_orders,
        SUM(total_earnings) as total_earnings,
        SUM(pending_settlement) as pending_settlement
      FROM players
    `);

    res.json(response(200, '获取成功', stats));
  } catch (err) {
    res.json(response(500, '获取统计数据失败'));
  }
});

// GET /:id - 打手详情
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const player = db.get('SELECT * FROM players WHERE id = ?', req.params.id);
    
    if (!player) {
      return res.json(response(404, '打手不存在'));
    }

    player.skills = parseJsonField(player.skills);

    // 获取该打手的结算记录
    const settlements = db.all(`
      SELECT s.*, o.order_no, o.game_type
      FROM settlements s
      LEFT JOIN orders o ON s.order_id = o.id
      WHERE s.player_id = ?
      ORDER BY s.created_at DESC
      LIMIT 10
    `, req.params.id);

    res.json(response(200, '获取成功', { ...player, settlements }));
  } catch (err) {
    res.json(response(500, '获取打手详情失败'));
  }
});

// POST / - 创建打手
router.post('/', (req, res) => {
  try {
    const db = getDatabase();
    const { nickname, kook_id, wechat, avatar, skills } = req.body;

    if (!nickname) {
      return res.json(response(400, '昵称不能为空'));
    }

    const result = db.run(`
      INSERT INTO players (nickname, kook_id, wechat, avatar, skills)
      VALUES (?, ?, ?, ?, ?)
    `, nickname, kook_id, wechat, avatar, JSON.stringify(skills || []));
    
    const player = db.get('SELECT * FROM players WHERE id = ?', result.lastInsertRowid);
    player.skills = parseJsonField(player.skills);

    res.json(response(200, '打手创建成功', player));
  } catch (err) {
    res.json(response(500, '创建打手失败'));
  }
});

// PUT /:id - 更新打手
router.put('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const { nickname, kook_id, wechat, avatar, skills } = req.body;
    const player = db.get('SELECT * FROM players WHERE id = ?', req.params.id);
    
    if (!player) {
      return res.json(response(404, '打手不存在'));
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
    if (avatar !== undefined) {
      updateFields.push('avatar = ?');
      params.push(avatar);
    }
    if (skills !== undefined) {
      updateFields.push('skills = ?');
      params.push(JSON.stringify(skills));
    }

    updateFields.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.run(`UPDATE players SET ${updateFields.join(', ')} WHERE id = ?`, ...params);

    const updated = db.get('SELECT * FROM players WHERE id = ?', req.params.id);
    updated.skills = parseJsonField(updated.skills);

    // WebSocket通知
    const wss = getWebSocketServer();
    if (wss) {
      wss.broadcast('player_status', updated);
    }

    res.json(response(200, '更新成功', updated));
  } catch (err) {
    res.json(response(500, '更新打手失败'));
  }
});

// PUT /:id/status - 更新打手状态
router.put('/:id/status', (req, res) => {
  try {
    const db = getDatabase();
    const { status } = req.body;
    const validStatuses = ['online', 'offline', 'busy'];

    if (!validStatuses.includes(status)) {
      return res.json(response(400, '无效的状态'));
    }

    const player = db.get('SELECT * FROM players WHERE id = ?', req.params.id);
    if (!player) {
      return res.json(response(404, '打手不存在'));
    }

    db.run("UPDATE players SET status = ?, updated_at = datetime('now') WHERE id = ?", status, req.params.id);

    const updated = db.get('SELECT * FROM players WHERE id = ?', req.params.id);
    updated.skills = parseJsonField(updated.skills);

    // WebSocket通知
    const wss = getWebSocketServer();
    if (wss) {
      wss.broadcast('player_status', updated);
    }

    res.json(response(200, '状态更新成功', updated));
  } catch (err) {
    res.json(response(500, '更新状态失败'));
  }
});

// DELETE /:id - 删除打手
router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const player = db.get('SELECT * FROM players WHERE id = ?', req.params.id);
    if (!player) {
      return res.json(response(404, '打手不存在'));
    }

    db.run('DELETE FROM players WHERE id = ?', req.params.id);
    res.json(response(200, '删除成功'));
  } catch (err) {
    res.json(response(500, '删除打手失败'));
  }
});

module.exports = router;
