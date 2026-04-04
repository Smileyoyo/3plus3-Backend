const express = require('express');
const router = express.Router();
const { getDatabase } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { response } = require('../utils/helpers');

// 所有路由需要认证
router.use(authMiddleware);

// GET /dashboard - 仪表盘数据
router.get('/dashboard', (req, res) => {
  try {
    const db = getDatabase();
    // 今日数据
    const today = new Date().toISOString().slice(0, 10);
    
    // 订单统计
    const orderStats = db.get(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as assigned_orders,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_orders,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
        SUM(CASE WHEN DATE(created_at) = ? THEN amount ELSE 0 END) as today_revenue
      FROM orders
    `, today);

    // 今日新订单数
    const todayOrders = db.get(`
      SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = ?
    `, today);

    // 打手统计
    const playerStats = db.get(`
      SELECT 
        COUNT(*) as total_players,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_players,
        SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as busy_players
      FROM players
    `);

    // VIP统计
    const vipStats = db.get(`
      SELECT 
        COUNT(*) as total_vips,
        SUM(balance) as total_balance,
        SUM(total_recharge) as total_recharge
      FROM vips
    `);

    // 结算统计
    const settlementStats = db.get(`
      SELECT 
        SUM(gross_amount) as total_gross,
        SUM(net_amount) as total_net,
        SUM(tips) as total_tips,
        SUM(CASE WHEN status = 'pending' THEN net_amount ELSE 0 END) as pending_amount,
        SUM(CASE WHEN status = 'approved' THEN net_amount ELSE 0 END) as approved_amount,
        SUM(CASE WHEN status = 'paid' THEN net_amount ELSE 0 END) as paid_amount
      FROM settlements
    `);

    // 最近7天订单趋势
    const weekOrders = db.all(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as orders,
        SUM(amount) as revenue
      FROM orders
      WHERE created_at >= date('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    // 游戏类型分布
    const gameDistribution = db.all(`
      SELECT 
        game_type,
        COUNT(*) as count,
        SUM(amount) as revenue
      FROM orders
      WHERE status = 'completed'
      GROUP BY game_type
    `);

    res.json(response(200, '获取成功', {
      orders: {
        ...orderStats,
        today_new_orders: todayOrders ? todayOrders.count : 0
      },
      players: playerStats,
      vips: vipStats,
      settlements: settlementStats,
      weekOrders,
      gameDistribution
    }));
  } catch (err) {
    console.error('获取仪表盘数据失败:', err);
    res.json(response(500, '获取仪表盘数据失败'));
  }
});

// GET /orders - 订单统计
router.get('/orders', (req, res) => {
  try {
    const db = getDatabase();
    const { startDate, endDate } = req.query;
    
    let whereClause = '';
    const params = [];
    
    if (startDate) {
      whereClause += ' AND created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      whereClause += ' AND created_at <= ?';
      params.push(endDate);
    }

    // 按状态统计
    const byStatus = db.all(`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(amount) as revenue
      FROM orders
      WHERE 1=1 ${whereClause}
      GROUP BY status
    `, ...params);

    // 按游戏类型统计
    const byGame = db.all(`
      SELECT 
        game_type,
        COUNT(*) as count,
        SUM(amount) as revenue
      FROM orders
      WHERE status = 'completed' ${whereClause}
      GROUP BY game_type
    `, ...params);

    // 按月统计
    const byMonth = db.all(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as orders,
        SUM(amount) as revenue
      FROM orders
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
      LIMIT 12
    `);

    res.json(response(200, '获取成功', {
      byStatus,
      byGame,
      byMonth
    }));
  } catch (err) {
    res.json(response(500, '获取订单统计失败'));
  }
});

// GET /revenue - 营收统计
router.get('/revenue', (req, res) => {
  try {
    const db = getDatabase();
    const { startDate, endDate } = req.query;
    
    let whereClause = '';
    const params = [];
    
    if (startDate) {
      whereClause += ' AND created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      whereClause += ' AND created_at <= ?';
      params.push(endDate);
    }

    // 总营收
    const totalRevenue = db.get(`
      SELECT 
        SUM(gross_amount) as total_gross,
        SUM(studio_fee) as total_studio_fee,
        SUM(manager_fee) as total_manager_fee,
        SUM(net_amount) as total_net,
        SUM(tips) as total_tips
      FROM settlements
    `);

    // 按时段统计
    const byPeriod = db.all(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        SUM(gross_amount) as gross,
        SUM(studio_fee) as studio_fee,
        SUM(manager_fee) as manager_fee,
        SUM(net_amount) as net,
        SUM(tips) as tips
      FROM settlements
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC
      LIMIT 12
    `);

    // 打手收益排行
    const playerRanking = db.all(`
      SELECT 
        p.id,
        p.nickname,
        COUNT(s.id) as settlement_count,
        SUM(s.gross_amount) as total_gross,
        SUM(s.net_amount) as total_net,
        SUM(s.tips) as total_tips
      FROM players p
      LEFT JOIN settlements s ON p.id = s.player_id
      GROUP BY p.id
      ORDER BY total_net DESC
      LIMIT 10
    `);

    res.json(response(200, '获取成功', {
      total: totalRevenue,
      byPeriod,
      playerRanking
    }));
  } catch (err) {
    res.json(response(500, '获取营收统计失败'));
  }
});

module.exports = router;
