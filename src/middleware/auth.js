const jwt = require('jsonwebtoken');
const config = require('../config');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.json({ code: 401, message: '未提供认证令牌', data: null });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.json({ code: 401, message: '令牌格式错误', data: null });
  }

  const token = parts[1];
  
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.json({ code: 401, message: '令牌已过期', data: null });
    }
    return res.json({ code: 401, message: '无效的令牌', data: null });
  }
}

// 角色权限检查中间件
function roleMiddleware(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.json({ code: 401, message: '未登录', data: null });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.json({ code: 403, message: '权限不足', data: null });
    }
    
    next();
  };
}

module.exports = { authMiddleware, roleMiddleware };
