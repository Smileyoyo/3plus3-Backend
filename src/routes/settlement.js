const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { settlementLimiter } = require('../middleware/rateLimit');
const settlementService = require('../services/settlementService');
const { response, paginatedResponse } = require('../utils/helpers');
const { getWebSocketServer } = require('../websocket');

// 所有路由需要认证
router.use(authMiddleware);

// GET / - 结算列表
router.get('/', (req, res) => {
  try {
    const result = settlementService.getSettlements({
      status: req.query.status,
      player_id: req.query.player_id,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page: req.query.page,
      pageSize: req.query.pageSize
    });

    res.json(paginatedResponse(result.list, result.total, result.page, result.pageSize));
  } catch (err) {
    res.json(response(500, '获取结算列表失败'));
  }
});

// GET /logs - 结算日志
router.get('/logs', (req, res) => {
  try {
    const result = settlementService.getLogs({
      settlement_id: req.query.settlement_id,
      player_id: req.query.player_id,
      page: req.query.page,
      pageSize: req.query.pageSize
    });

    res.json(paginatedResponse(result.list, result.total, result.page, result.pageSize));
  } catch (err) {
    res.json(response(500, '获取结算日志失败'));
  }
});

// POST / - 创建结算
router.post('/', settlementLimiter, (req, res) => {
  try {
    const { order_id, player_id } = req.body;

    if (!order_id || !player_id) {
      return res.json(response(400, '订单ID和打手ID不能为空'));
    }

    const settlement = settlementService.createSettlement(order_id, player_id);

    // WebSocket通知
    const wss = getWebSocketServer();
    if (wss) {
      wss.broadcast('settlement_update', settlement);
    }

    res.json(response(200, '结算创建成功', settlement));
  } catch (err) {
    res.json(response(500, err.message || '创建结算失败'));
  }
});

// POST /:id/approve - 审核结算
router.post('/:id/approve', settlementLimiter, (req, res) => {
  try {
    const settlement = settlementService.approveSettlement(req.params.id, req.user.id);

    // WebSocket通知
    const wss = getWebSocketServer();
    if (wss) {
      wss.broadcast('settlement_update', settlement);
    }

    res.json(response(200, '审核成功', settlement));
  } catch (err) {
    res.json(response(500, err.message || '审核失败'));
  }
});

// POST /:id/pay - 执行结算付款
router.post('/:id/pay', settlementLimiter, (req, res) => {
  try {
    const settlement = settlementService.paySettlement(req.params.id, req.user.id);

    // WebSocket通知
    const wss = getWebSocketServer();
    if (wss) {
      wss.broadcast('settlement_update', settlement);
    }

    res.json(response(200, '付款成功', settlement));
  } catch (err) {
    res.json(response(500, err.message || '付款失败'));
  }
});

// POST /:id/tips - 添加鸡腿
router.post('/:id/tips', settlementLimiter, (req, res) => {
  try {
    const { amount, remark } = req.body;

    if (!amount || amount <= 0) {
      return res.json(response(400, '请输入有效的鸡腿金额'));
    }

    const settlement = settlementService.addTips(req.params.id, amount, req.user.id, remark);

    // WebSocket通知
    const wss = getWebSocketServer();
    if (wss) {
      wss.broadcast('settlement_update', settlement);
    }

    res.json(response(200, '鸡腿添加成功', settlement));
  } catch (err) {
    res.json(response(500, err.message || '添加鸡腿失败'));
  }
});

// PUT /:id - 修改结算金额
router.put('/:id', settlementLimiter, (req, res) => {
  try {
    const { amount, remark } = req.body;

    if (!amount || amount <= 0) {
      return res.json(response(400, '请输入有效的金额'));
    }

    const settlement = settlementService.modifyAmount(req.params.id, amount, req.user.id, remark);

    // WebSocket通知
    const wss = getWebSocketServer();
    if (wss) {
      wss.broadcast('settlement_update', settlement);
    }

    res.json(response(200, '结算金额修改成功', settlement));
  } catch (err) {
    res.json(response(500, err.message || '修改结算金额失败'));
  }
});

// GET /:id - 获取结算详情
router.get('/:id', (req, res) => {
  try {
    const settlement = settlementService.getSettlementById(req.params.id);
    
    if (!settlement) {
      return res.json(response(404, '结算记录不存在'));
    }

    res.json(response(200, '获取成功', settlement));
  } catch (err) {
    res.json(response(500, '获取结算详情失败'));
  }
});

module.exports = router;
