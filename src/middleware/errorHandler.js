// 统一错误处理中间件
function errorHandler(err, req, res, next) {
  console.error('错误:', err);

  // 数据库错误
  if (err.code === 'SQLITE_CONSTRAINT') {
    return res.json({
      code: 400,
      message: '数据约束错误，可能存在重复数据',
      data: null
    });
  }

  // 乐观锁冲突
  if (err.message && err.message.includes('版本号不匹配')) {
    return res.json({
      code: 409,
      message: '数据已被修改，请刷新后重试',
      data: null
    });
  }

  // 默认错误
  res.json({
    code: 500,
    message: err.message || '服务器内部错误',
    data: null
  });
}

// 404处理
function notFoundHandler(req, res) {
  res.json({
    code: 404,
    message: '接口不存在',
    data: null
  });
}

module.exports = { errorHandler, notFoundHandler };
