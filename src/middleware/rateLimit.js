const rateLimit = require('express-rate-limit');

// 全局限流：每个用户每秒最多10个请求
const globalLimiter = rateLimit({
  windowMs: 1000,
  max: 10,
  message: { code: 429, message: '请求过于频繁，请稍后再试', data: null },
  standardHeaders: true,
  legacyHeaders: false,
});

// 结算接口限流：每分钟最多10次
const settlementLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { code: 429, message: '结算操作过于频繁，请稍后再试', data: null },
  standardHeaders: true,
  legacyHeaders: false,
});

// 登录限流：每分钟最多5次
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { code: 429, message: '登录尝试过于频繁，请稍后再试', data: null },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  globalLimiter,
  settlementLimiter,
  loginLimiter
};
