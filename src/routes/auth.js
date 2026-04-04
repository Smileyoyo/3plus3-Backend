const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { getDatabase } = require('../models/database');
const config = require('../config');
const { authMiddleware } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');
const { response } = require('../utils/helpers');

// POST /login - 登录
router.post('/login', loginLimiter, (req, res) => {
  try {
    const db = getDatabase();
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.json(response(400, '用户名和密码不能为空'));
    }

    const user = db.get('SELECT * FROM users WHERE username = ? AND status = ?', username, 'active');
    
    if (!user) {
      return res.json(response(401, '用户名或密码错误'));
    }

    const isValid = bcrypt.compareSync(password, user.password);
    
    if (!isValid) {
      return res.json(response(401, '用户名或密码错误'));
    }

    const token = jwt.sign({
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role
    }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

    res.json(response(200, '登录成功', {
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        role: user.role,
        avatar: user.avatar
      }
    }));
  } catch (err) {
    console.error('登录错误:', err);
    res.json(response(500, '登录失败'));
  }
});

// POST /logout - 登出
router.post('/logout', authMiddleware, (req, res) => {
  res.json(response(200, '登出成功'));
});

// GET /user - 获取当前用户
router.get('/user', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const user = db.get('SELECT id, username, nickname, role, avatar, status, created_at FROM users WHERE id = ?', req.user.id);
    
    if (!user) {
      return res.json(response(404, '用户不存在'));
    }

    res.json(response(200, '获取成功', user));
  } catch (err) {
    res.json(response(500, '获取失败'));
  }
});

// POST /change-password - 修改密码
router.post('/change-password', authMiddleware, (req, res) => {
  try {
    const db = getDatabase();
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
      return res.json(response(400, '请填写完整信息'));
    }

    if (newPassword.length < 6) {
      return res.json(response(400, '新密码至少6位'));
    }

    const user = db.get('SELECT * FROM users WHERE id = ?', req.user.id);
    
    if (!bcrypt.compareSync(oldPassword, user.password)) {
      return res.json(response(401, '原密码错误'));
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.run('UPDATE users SET password = ?, updated_at = datetime("now") WHERE id = ?', hashedPassword, req.user.id);

    res.json(response(200, '密码修改成功'));
  } catch (err) {
    res.json(response(500, '修改失败'));
  }
});

module.exports = router;
