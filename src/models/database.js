const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();
  
  const dbPath = path.resolve(config.dbPath);
  
  // 确保目录存在
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // 加载或创建数据库
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // 启用外键
  db.run('PRAGMA foreign_keys = ON');

  // 用户表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT,
      role TEXT DEFAULT 'operator',
      avatar TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 打手表
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL,
      phone TEXT,
      game_id TEXT,
      game_tier TEXT,
      kook_id TEXT,
      wechat TEXT,
      avatar TEXT,
      status TEXT DEFAULT 'offline',
      skills TEXT,
      total_orders INTEGER DEFAULT 0,
      completed_orders INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      total_earnings REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      pending_settlement REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 添加新字段（如果不存在）
  try { db.run('ALTER TABLE players ADD COLUMN phone TEXT'); } catch (e) {}
  try { db.run('ALTER TABLE players ADD COLUMN game_id TEXT'); } catch (e) {}
  try { db.run('ALTER TABLE players ADD COLUMN game_tier TEXT'); } catch (e) {}
  try { db.run('ALTER TABLE players ADD COLUMN completed_orders INTEGER DEFAULT 0'); } catch (e) {}
  try { db.run('ALTER TABLE players ADD COLUMN rating REAL DEFAULT 0'); } catch (e) {}
  try { db.run('ALTER TABLE players ADD COLUMN balance REAL DEFAULT 0'); } catch (e) {}

  // VIP表
  db.run(`
    CREATE TABLE IF NOT EXISTS vips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL,
      kook_id TEXT,
      wechat TEXT,
      phone TEXT,
      level INTEGER DEFAULT 1,
      balance REAL DEFAULT 0,
      total_recharge REAL DEFAULT 0,
      total_spent REAL DEFAULT 0,
      total_orders INTEGER DEFAULT 0,
      tags TEXT,
      status TEXT DEFAULT 'active',
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 添加 total_spent 字段（如果不存在）
  try {
    db.run('ALTER TABLE vips ADD COLUMN total_spent REAL DEFAULT 0');
  } catch (e) {
    // 字段已存在，忽略
  }
  try {
    db.run('ALTER TABLE vips ADD COLUMN remark TEXT');
  } catch (e) {
    // 字段已存在，忽略
  }

  // 订单表
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT UNIQUE NOT NULL,
      game_type TEXT NOT NULL,
      vip_id INTEGER,
      vip_name TEXT,
      vip_phone TEXT,
      boss_kook_id TEXT,
      boss_wechat TEXT,
      current_tier TEXT,
      target_tier TEXT,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      player_ids TEXT,
      player_name TEXT,
      assign_time DATETIME,
      complete_time DATETIME,
      cancel_reason TEXT,
      remark TEXT,
      version INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 添加新字段（如果不存在）
  try { db.run('ALTER TABLE orders ADD COLUMN vip_id INTEGER'); } catch (e) {}
  try { db.run('ALTER TABLE orders ADD COLUMN vip_name TEXT'); } catch (e) {}
  try { db.run('ALTER TABLE orders ADD COLUMN vip_phone TEXT'); } catch (e) {}
  try { db.run('ALTER TABLE orders ADD COLUMN current_tier TEXT'); } catch (e) {}
  try { db.run('ALTER TABLE orders ADD COLUMN target_tier TEXT'); } catch (e) {}
  try { db.run('ALTER TABLE orders ADD COLUMN player_name TEXT'); } catch (e) {}
  try { db.run('ALTER TABLE orders ADD COLUMN remark TEXT'); } catch (e) {}

  // 结算表
  db.run(`
    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      player_id INTEGER,
      gross_amount REAL NOT NULL,
      studio_fee REAL DEFAULT 0,
      manager_fee REAL DEFAULT 0,
      tips REAL DEFAULT 0,
      net_amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      approved_by INTEGER,
      paid_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (player_id) REFERENCES players(id)
    )
  `);

  // 结算日志表
  db.run(`
    CREATE TABLE IF NOT EXISTS settlement_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_id INTEGER,
      order_id INTEGER,
      player_id INTEGER,
      operator_id INTEGER,
      action TEXT NOT NULL,
      amount REAL,
      before_amount REAL,
      after_amount REAL,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 订单锁表
  db.run(`
    CREATE TABLE IF NOT EXISTS order_locks (
      order_id INTEGER PRIMARY KEY,
      locked_by TEXT,
      locked_at DATETIME,
      expires_at DATETIME
    )
  `);

  // 创建索引
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_game_type ON orders(game_type)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_settlements_player_id ON settlements(player_id)`);

  // 保存数据库
  saveDatabase();

  console.log('数据库初始化完成');
  return db;
}

function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(path.resolve(config.dbPath), buffer);
}

// 数据库操作封装
const dbWrapper = {
  run(sql, ...params) {
    try {
      db.run(sql, params);
      saveDatabase();
      return { lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0, changes: db.getRowsModified() };
    } catch (err) {
      throw err;
    }
  },
  
  get(sql, ...params) {
    try {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
      }
      stmt.free();
      return null;
    } catch (err) {
      throw err;
    }
  },
  
  all(sql, ...params) {
    try {
      const stmt = db.prepare(sql);
      if (params.length > 0) {
        stmt.bind(params);
      }
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    } catch (err) {
      throw err;
    }
  },
  
  exec(sql) {
    try {
      db.run(sql);
      saveDatabase();
    } catch (err) {
      throw err;
    }
  },
  
  prepare(sql) {
    return {
      run: (...params) => {
        try {
          db.run(sql, params);
          saveDatabase();
          return { lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0, changes: db.getRowsModified() };
        } catch (err) {
          throw err;
        }
      },
      get: (...params) => {
        try {
          const stmt = db.prepare(sql);
          stmt.bind(params);
          if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
          }
          stmt.free();
          return null;
        } catch (err) {
          throw err;
        }
      },
      all: (...params) => {
        try {
          const stmt = db.prepare(sql);
          if (params.length > 0) {
            stmt.bind(params);
          }
          const results = [];
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          stmt.free();
          return results;
        } catch (err) {
          throw err;
        }
      }
    };
  }
};

function getDatabase() {
  return dbWrapper;
}

module.exports = { initDatabase, getDatabase, saveDatabase };
