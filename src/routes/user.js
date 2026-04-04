const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../models/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { response, paginatedResponse } = require('../utils/helpers');

// 所有路由需要认证
router.use(authMiddleware);

// GET / - 用户列表（仅admin）
router.get('/', roleMiddleware('admin'), (req, res) => {
  try {
    const db = getDatabase();
    const { role, status } = req.query;
    
    let sql = 'SELECT id, username, nickname, role, avatar, status, created_at, updated_at FROM users WHERE 1=1';
    const params = [];

    if (role) {
      sql += ' AND role = ?';
      params.push(role);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    const countSql = sql.replace('SELECT id, username, nickname, role, avatar, status, created_at, updated_at', 'SELECT COUNT(*) as count');
    const totalResult = db.get(countSql, ...params);
    const total = totalResult ? totalResult.count : 0;

    sql += ' LIMIT ? OFFSET ?';
    params.push(pageSize, offset);
    const users = db.all(sql, ...params);

    res.json(paginatedResponse(users, total, page, pageSize));
  } catch (err) {
    res.json(response(500, '获取用户列表失败'));
  }
});

// POST / - 创建用户（仅admin）
router.post('/', roleMiddleware('admin'), (req, res) => {
  try {
    const db = getDatabase();
    const { username, password, nickname, role } = req.body;

    if (!username || !password) {
      return res.json(response(400, '用户名和密码不能为空'));
    }

    if (password.length < 6) {
      return res.json(response(400, '密码至少6位'));
    }

    // 检查用户名是否已存在
    const existing = db.get('SELECT id FROM users WHERE username = ?', username);
    if (existing) {
      return res.json(response(400, '用户名已存在'));
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.run(`
      INSERT INTO users (username, password, nickname, role)
      VALUES (?, ?, ?, ?)
    `, username, hashedPassword, nickname || username, role || 'operator');

    const user = db.get('SELECT id, username, nickname, role, avatar, status, created_at FROM users WHERE id = ?', result.lastInsertRowid);

    res.json(response(200, '用户创建成功', user));
  } catch (err) {
    res.json(response(500, '创建用户失败'));
  }
});

// PUT /:id - 更新用户（仅admin或自己）
router.put('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const { nickname, role, status, avatar } = req.body;
    
    // 只有admin可以修改其他用户，或者用户修改自己的信息
    if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) {
      return res.json(response(403, '权限不足'));
    }

    const user = db.get('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!user) {
      return res.json(response(404, '用户不存在'));
    }

    const updateFields = [];
    const params = [];

    if (nickname !== undefined) {
      updateFields.push('nickname = ?');
      params.push(nickname);
    }
    if (role !== undefined && req.user.role === 'admin') {
      updateFields.push('role = ?');
      params.push(role);
    }
    if (status !== undefined && req.user.role === 'admin') {
      updateFields.push('status = ?');
      params.push(status);
    }
    if (avatar !== undefined) {
      updateFields.push('avatar = ?');
      params.push(avatar);
    }

    if (updateFields.length === 0) {
      return res.json(response(400, '没有要更新的字段'));
    }

    updateFields.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.run(`UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`, ...params);

    const updated = db.get('SELECT id, username, nickname, role, avatar, status, created_at FROM users WHERE id = ?', req.params.id);

    res.json(response(200, '更新成功', updated));
  } catch (err) {
    res.json(response(500, '更新用户失败'));
  }
});

// DELETE /:id - 删除用户（仅admin）
router.delete('/:id', roleMiddleware('admin'), (req, res) => {
  try {
    const db = getDatabase();
    if (req.user.id === parseInt(req.params.id)) {
      return res.json(response(400, '不能删除自己'));
    }

    const user = db.get('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!user) {
      return res.json(response(404, '用户不存在'));
    }

    db.run('DELETE FROM users WHERE id = ?', req.params.id);
    res.json(response(200, '删除成功'));
  } catch (err) {
    res.json(response(500, '删除用户失败'));
  }
});

// GET /:id - 获取用户详情
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    // 只有admin可以查看其他用户，或者用户查看自己
    if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id)) {
      return res.json(response(403, '权限不足'));
    }

    const user = db.get('SELECT id, username, nickname, role, avatar, status, created_at, updated_at FROM users WHERE id = ?', req.params.id);
    
    if (!user) {
      return res.json(response(404, '用户不存在'));
    }

    res.json(response(200, '获取成功', user));
  } catch (err) {
    res.json(response(500, '获取用户详情失败'));
  }
});

module.exports = router;
