const { v4: uuidv4 } = require('uuid');

/**
 * 生成订单号
 */
function generateOrderNo() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substr(2, 6).toUpperCase();
  return `ORD${dateStr}${random}`;
}

/**
 * 统一响应格式
 */
function response(code = 200, message = 'success', data = null) {
  return { code, message, data };
}

/**
 * 分页响应
 */
function paginatedResponse(list, total, page, pageSize) {
  return {
    code: 200,
    message: 'success',
    data: {
      list,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(total / pageSize)
    }
  };
}

/**
 * 解析JSON字段
 */
function parseJsonField(str, defaultValue = []) {
  if (!str) return defaultValue;
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

/**
 * 格式化日期
 */
function formatDate(date) {
  if (!date) return null;
  return new Date(date).toISOString();
}

/**
 * 计算结算金额
 */
function calculateSettlement(amount, config) {
  const studioFee = amount * config.studioFeeRate;
  const managerFee = amount * config.managerFeeRate;
  const netAmount = amount - studioFee - managerFee;
  
  return {
    gross_amount: amount,
    studio_fee: studioFee,
    manager_fee: managerFee,
    net_amount: netAmount
  };
}

module.exports = {
  generateOrderNo,
  response,
  paginatedResponse,
  parseJsonField,
  formatDate,
  calculateSettlement,
  uuidv4
};
