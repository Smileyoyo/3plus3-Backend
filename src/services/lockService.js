const { getDatabase } = require('../models/database');

/**
 * 尝试获取订单锁
 */
function acquireLock(orderId, operatorId) {
  const db = getDatabase();
  const now = new Date();
  const expires = new Date(now.getTime() + 30000); // 30秒过期

  // 检查是否存在有效锁
  const existingLock = db.get('SELECT * FROM order_locks WHERE order_id = ?', orderId);
  
  if (existingLock) {
    // 锁存在，检查是否过期
    if (new Date(existingLock.expires_at) > now) {
      // 锁未过期，检查是否是同一个操作者
      if (existingLock.locked_by !== operatorId) {
        return { success: false, message: '订单正在被其他人操作' };
      }
      // 同一个操作者，刷新锁
      db.run('UPDATE order_locks SET expires_at = ? WHERE order_id = ?', expires.toISOString(), orderId);
      return { success: true, message: '锁已刷新' };
    }
    // 锁已过期，删除旧锁
    db.run('DELETE FROM order_locks WHERE order_id = ?', orderId);
  }

  // 尝试插入新锁
  try {
    db.run(`
      INSERT INTO order_locks (order_id, locked_by, locked_at, expires_at)
      VALUES (?, ?, ?, ?)
    `, orderId, operatorId, now.toISOString(), expires.toISOString());
    return { success: true, message: '锁获取成功' };
  } catch (err) {
    return { success: false, message: '获取锁失败' };
  }
}

/**
 * 释放订单锁
 */
function releaseLock(orderId, operatorId) {
  const db = getDatabase();
  const lock = db.get('SELECT * FROM order_locks WHERE order_id = ?', orderId);
  
  if (lock && lock.locked_by === operatorId) {
    db.run('DELETE FROM order_locks WHERE order_id = ?', orderId);
    return true;
  }
  return false;
}

/**
 * 清理过期锁
 */
function cleanupExpiredLocks() {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.run('DELETE FROM order_locks WHERE expires_at < ?', now);
}

// 每分钟清理一次过期锁
setInterval(cleanupExpiredLocks, 60000);

module.exports = {
  acquireLock,
  releaseLock,
  cleanupExpiredLocks
};
