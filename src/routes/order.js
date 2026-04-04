const express = require('express');
const router = express.Router();
const { getDatabase } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const orderService = require('../services/orderService');
const settlementService = require('../services/settlementService');
const { response, paginatedResponse } = require('../utils/helpers');
const { getWebSocketServer } = require('../websocket');

// 所有路由需要认证
router.use(authMiddleware);

// GET / - 订单列表
router.get('/', (req, res) => {
  try {
    const result = orderService.getOrders({
      status: req.query.status,
      gameType: req.query.gameType,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page: req.query.page,
      pageSize: req.query.pageSize
    });

    res.json(paginatedResponse(result.list, result.total, result.page, result.pageSize));
  } catch (err) {
    res.json(response(500, '获取订单列表失败'));
  }
});

// GET /:id - 订单详情
router.get('/:id', (req, res) => {
  try {
    const order = orderService.getOrderById(req.params.id);
    
    if (!order) {
      return res.json(response(404, '订单不存在'));
    }

    res.json(response(200, '获取成功', order));
  } catch (err) {
    res.json(response(500, '获取订单详情失败'));
  }
});

// POST / - 创建订单
router.post('/', (req, res) => {
  try {
    const { game_type, boss_kook_id, boss_wechat, amount } = req.body;

    if (!game_type || !amount) {
      return res.json(response(400, '游戏类型和金额不能为空'));
    }

    const order = orderService.createOrder({
      game_type,
      boss_kook_id,
      boss_wechat,
      amount
    });

    // WebSocket通知
    const wss = getWebSocketServer();
    if (wss) {
      wss.broadcast('new_order', order);
    }

    res.json(response(200, '订单创建成功', order));
  } catch (err) {
    res.json(response(500, '创建订单失败'));
  }
});

// PUT /:id - 更新订单（乐观锁）
router.put('/:id', (req, res) => {
  try {
    const order = orderService.getOrderById(req.params.id);
    if (!order) {
      return res.json(response(404, '订单不存在'));
    }

    const updated = orderService.updateOrder(req.params.id, req.body, order.version);

    // WebSocket通知
    const wss = getWebSocketServer();
    if (wss) {
      wss.broadcast('order_update', updated);
    }

    res.json(response(200, '订单更新成功', updated));
  } catch (err) {
    if (err.message.includes('版本号不匹配')) {
      return res.json(response(409, err.message));
    }
    res.json(response(500, err.message || '更新订单失败'));
  }
});

// POST /:id/assign - 派单
router.post('/:id/assign', (req, res) => {
  try {
    const { player_ids } = req.body;

    if (!player_ids || !Array.isArray(player_ids) || player_ids.length === 0) {
      return res.json(response(400, '请选择打手'));
    }

    const order = orderService.getOrderById(req.params.id);
    if (!order) {
      return res.json(response(404, '订单不存在'));
    }
    if (order.status !== 'pending') {
      return res.json(response(400, '只能对待派单订单进行派单'));
    }

    const updated = orderService.assignOrder(req.params.id, player_ids, order.version);

    // WebSocket通知
    const wss = getWebSocketServer();
    if (wss) {
      wss.broadcast('order_update', updated);
    }

    res.json(response(200, '派单成功', updated));
  } catch (err) {
    if (err.message.includes('版本号不匹配')) {
      return res.json(response(409, err.message));
    }
    res.json(response(500, err.message || '派单失败'));
  }
});

// POST /:id/complete - 完成订单
router.post('/:id/complete', (req, res) => {
  try {
    const order = orderService.getOrderById(req.params.id);
    if (!order) {
      return res.json(response(404, '订单不存在'));
    }
    if (order.status !== 'assigned' && order.status !== 'processing') {
      return res.json(response(400, '只能对已派单的订单进行完成操作'));
    }

    const updated = orderService.completeOrder(req.params.id, order.version);

    // 自动创建结算
    try {
      settlementService.batchCreateSettlements(req.params.id);
    } catch (settleErr) {
      console.error('创建结算失败:', settleErr);
    }

    // WebSocket通知
    const wss = getWebSocketServer();
    if (wss) {
      wss.broadcast('order_update', updated);
    }

    res.json(response(200, '订单完成', updated));
  } catch (err) {
    if (err.message.includes('版本号不匹配')) {
      return res.json(response(409, err.message));
    }
    res.json(response(500, err.message || '完成订单失败'));
  }
});

// POST /:id/cancel - 取消订单
router.post('/:id/cancel', (req, res) => {
  try {
    const { reason } = req.body;

    const order = orderService.getOrderById(req.params.id);
    if (!order) {
      return res.json(response(404, '订单不存在'));
    }
    if (order.status === 'completed' || order.status === 'cancelled') {
      return res.json(response(400, '该订单无法取消'));
    }

    const updated = orderService.cancelOrder(req.params.id, reason || '用户取消', order.version);

    // WebSocket通知
    const wss = getWebSocketServer();
    if (wss) {
      wss.broadcast('order_update', updated);
    }

    res.json(response(200, '订单已取消', updated));
  } catch (err) {
    if (err.message.includes('版本号不匹配')) {
      return res.json(response(409, err.message));
    }
    res.json(response(500, err.message || '取消订单失败'));
  }
});

// GET /export - 导出订单
router.get('/export', (req, res) => {
  try {
    const result = orderService.getOrders({
      status: req.query.status,
      gameType: req.query.gameType,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page: 1,
      pageSize: 10000
    });

    res.json(response(200, '导出成功', result.list));
  } catch (err) {
    res.json(response(500, '导出失败'));
  }
});

// DELETE /:id - 删除订单
router.delete('/:id', (req, res) => {
  try {
    const order = orderService.getOrderById(req.params.id);
    if (!order) {
      return res.json(response(404, '订单不存在'));
    }

    orderService.deleteOrder(req.params.id);
    res.json(response(200, '删除成功'));
  } catch (err) {
    res.json(response(500, '删除失败'));
  }
});

module.exports = router;
