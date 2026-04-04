const bcrypt = require('bcryptjs');
const { getDatabase } = require('./database');

function seedData() {
  const db = getDatabase();
  
  // 检查是否已有管理员
  const existingAdmin = db.get('SELECT id FROM users WHERE username = ?', 'admin');
  
  if (!existingAdmin) {
    // 创建默认管理员
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.run(`
      INSERT INTO users (username, password, nickname, role)
      VALUES (?, ?, ?, ?)
    `, 'admin', hashedPassword, '管理员', 'admin');
    
    console.log('默认管理员账号创建完成: admin / admin123');
  }

  // 检查是否已有打手数据
  const playerCount = db.get('SELECT COUNT(*) as count FROM players');
  if (!playerCount || playerCount.count === 0) {
    // 创建示例打手
    const players = [
      { nickname: '小王', kook_id: 'Kook001', wechat: 'wx001', skills: '["暗区突围", "三角洲行动"]', status: 'online' },
      { nickname: '小李', kook_id: 'Kook002', wechat: 'wx002', skills: '["瓦罗兰特"]', status: 'offline' },
      { nickname: '小张', kook_id: 'Kook003', wechat: 'wx003', skills: '["暗区突围", "瓦罗兰特"]', status: 'busy' }
    ];
    
    players.forEach(p => {
      db.run(`
        INSERT INTO players (nickname, kook_id, wechat, skills, status)
        VALUES (?, ?, ?, ?, ?)
      `, p.nickname, p.kook_id, p.wechat, p.skills, p.status);
    });
    
    console.log('示例打手数据创建完成');
  }

  // 检查是否已有VIP数据
  const vipCount = db.get('SELECT COUNT(*) as count FROM vips');
  if (!vipCount || vipCount.count === 0) {
    // 创建示例VIP
    const vips = [
      { nickname: 'VIP张三', kook_id: 'VipKook001', wechat: 'vipwx001', phone: '13800138001', level: 3, tags: '["常客"]' },
      { nickname: 'VIP李四', kook_id: 'VipKook002', wechat: 'vipwx002', phone: '13800138002', level: 1, tags: '[]' }
    ];
    
    vips.forEach(v => {
      db.run(`
        INSERT INTO vips (nickname, kook_id, wechat, phone, level, tags)
        VALUES (?, ?, ?, ?, ?, ?)
      `, v.nickname, v.kook_id, v.wechat, v.phone, v.level, v.tags);
    });
    
    console.log('示例VIP数据创建完成');
  }

  console.log('种子数据初始化完成');
}

module.exports = { seedData };
