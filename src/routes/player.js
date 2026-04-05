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
    const { status, gameTier, keyword } = req.query;
    
    let sql = 'SELECT * FROM players WHERE 1=1';
    const params = [];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (gameTier) {
      sql += ' AND game_tier = ?';
      params.push(gameTier);
    }
    if (keyword) {
      sql += ' AND (nickname LIKE ? OR game_id LIKE ? OR phone LIKE ?)';
      const searchPattern = `%${keyword}%`;
      params.push(searchPattern, searchPattern, searchPattern);
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
      players.map(p => ({
        ...p,
        skills: parseJsonField(p.skills),
        gameId: p.game_id,
        gameTier: p.game_tier,
        completedOrders: p.completed_orders || 0,
        totalOrders: p.total_orders
      })),
      total,
      page,
      pageSize
    ));
  } catch (err) {
    console.error('获取打手列表失败:', err);
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
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online,
        SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as busy,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline,
        SUM(total_orders) as totalOrders,
        SUM(total_earnings) as totalEarnings,
        SUM(pending_settlement) as pendingSettlement,
        AVG(rating) as avgRating
      FROM players
    `);

    res.json(response(200, '获取成功', stats));
  } catch (err) {
    res.json(response(500, '获取统计数据失败'));
  }
});

// GET /online - 获取在线打手
router.get('/online', (req, res) => {
  try {
    const db = getDatabase();
    const players = db.all("SELECT * FROM players WHERE status = 'online' ORDER BY completed_orders DESC");

    res.json(response(200, '获取成功', players.map(p => ({
      ...p,
      skills: parseJsonField(p.skills),
      gameId: p.game_id,
      gameTier: p.game_tier,
      completedOrders: p.completed_orders || 0
    }))));
  } catch (err) {
    res.json(response(500, '获取在线打手失败'));
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
    player.gameId = player.game_id;
    player.gameTier = player.game_tier;
    player.completedOrders = player.completed_orders || 0;

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
    const { nickname, phone, gameId, gameTier, status } = req.body;

    if (!nickname) {
      return res.json(response(400, '昵称不能为空'));
    }

    const result = db.run(`
      INSERT INTO players (nickname, phone, game_id, game_tier, status)
      VALUES (?, ?, ?, ?, ?)
    `, nickname, phone || null, gameId || null, gameTier || null, status || 'offline');
    
    const player = db.get('SELECT * FROM players WHERE id = ?', result.lastInsertRowid);

    res.json(response(200, '打手创建成功', {
      ...player,
      skills: parseJsonField(player.skills),
      gameId: player.game_id,
      gameTier: player.game_tier,
      completedOrders: player.completed_orders || 0
    }));
  } catch (err) {
    console.error('创建打手失败:', err);
    res.json(response(500, '创建打手失败'));
  }
});

// PUT /:id - 更新打手
router.put('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const { nickname, phone, gameId, gameTier, status } = req.body;
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
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      params.push(phone);
    }
    if (gameId !== undefined) {
      updateFields.push('game_id = ?');
      params.push(gameId);
    }
    if (gameTier !== undefined) {
      updateFields.push('game_tier = ?');
      params.push(gameTier);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      params.push(status);
    }

    updateFields.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.run(`UPDATE players SET ${updateFields.join(', ')} WHERE id = ?`, ...params);

    const updated = db.get('SELECT * FROM players WHERE id = ?', req.params.id);

    // WebSocket通知
    const wss = getWebSocketServer();
    if (wss) {
      wss.broadcast('player_status', updated);
    }

    res.json(response(200, '更新成功', {
      ...updated,
      skills: parseJsonField(updated.skills),
      gameId: updated.game_id,
      gameTier: updated.game_tier,
      completedOrders: updated.completed_orders || 0
    }));
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

    // WebSocket通知
    const wss = getWebSocketServer();
    if (wss) {
      wss.broadcast('player_status', updated);
    }

    res.json(response(200, '状态更新成功', {
      ...updated,
      skills: parseJsonField(updated.skills),
      gameId: updated.game_id,
      gameTier: updated.game_tier,
      completedOrders: updated.completed_orders || 0
    }));
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
