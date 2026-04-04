const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

const config = require('./src/config');
const { initDatabase } = require('./src/models/database');
const { seedData } = require('./src/models/seed');
const { initWebSocket } = require('./src/websocket');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');
const { globalLimiter } = require('./src/middleware/rateLimit');

// 路由
const authRoutes = require('./src/routes/auth');
const orderRoutes = require('./src/routes/order');
const settlementRoutes = require('./src/routes/settlement');
const playerRoutes = require('./src/routes/player');
const vipRoutes = require('./src/routes/vip');
const userRoutes = require('./src/routes/user');
const statsRoutes = require('./src/routes/stats');

const app = express();
const server = http.createServer(app);

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 全局限流
app.use(globalLimiter);

// 静态文件（如果需要）
app.use(express.static(path.join(__dirname, 'public')));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/settlements', settlementRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/vips', vipRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stats', statsRoutes);

// 404处理
app.use(notFoundHandler);

// 错误处理
app.use(errorHandler);

// 初始化
async function startServer() {
  try {
    // 初始化数据库
    await initDatabase();
    
    // 初始化种子数据
    seedData();
    
    // 初始化WebSocket
    initWebSocket(server);
    
    // 启动服务器
    server.listen(config.port, () => {
      console.log(`====================================`);
      console.log(`3Plus3俱乐部后台服务已启动`);
      console.log(`端口: ${config.port}`);
      console.log(`WebSocket: ws://localhost:${config.port}/ws`);
      console.log(`健康检查: http://localhost:${config.port}/health`);
      console.log(`====================================`);
      console.log(`默认管理员: admin / admin123`);
      console.log(`====================================`);
    });
  } catch (err) {
    console.error('服务器启动失败:', err);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM信号，关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT信号，关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

startServer();

module.exports = { app, server };
