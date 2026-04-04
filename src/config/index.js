module.exports = {
  port: process.env.PORT || 18789,
  jwtSecret: process.env.JWT_SECRET || '3plus3-club-secret-key-2024',
  jwtExpiresIn: '24h',
  dataDir: './data',
  dbPath: './data/3plus3.db',
  // 结算比例配置
  settlement: {
    studioFeeRate: 0.20,  // 工作室20%
    managerFeeRate: 0.05,  // 店长5%
  },
  // VIP等级配置
  vipLevels: {
    1: { name: '青铜', color: '#CD7F32', minRecharge: 0 },
    2: { name: '白银', color: '#C0C0C0', minRecharge: 1000 },
    3: { name: '黄金', color: '#FFD700', minRecharge: 5000 },
    4: { name: '铂金', color: '#E5E4E2', minRecharge: 20000 },
    5: { name: '钻石', color: '#B9F2FF', minRecharge: 50000 }
  },
  // 游戏类型
  gameTypes: ['暗区突围', '三角洲行动', '瓦罗兰特']
};
