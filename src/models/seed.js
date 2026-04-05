const bcrypt = require('bcryptjs');
const { getDatabase } = require('./database');

// 生成订单号
function generateOrderNo() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `ORD${datePart}${rand}`;
}

// 格式化日期为 SQLite 兼容的字符串
function formatDateStr(daysAgo) {
  const now = new Date();
  const past = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return past.toISOString().replace('T', ' ').slice(0, 19);
}

// VIP客户数据（12个）
const vipsData = [
  { nickname: '周大福',   phone: '13800001001', level: 5, balance: 5000,  total_recharge: 20000, total_orders: 28, total_spent: 15000, tags: '["钻石客户","常客","高价值"]' },
  { nickname: '李明星',   phone: '13800001002', level: 4, balance: 3000,  total_recharge: 12000, total_orders: 18, total_spent: 9000,  tags: '["铂金客户","深夜党"]' },
  { nickname: '王子豪',   phone: '13800001003', level: 4, balance: 1500,  total_recharge: 10000, total_orders: 15, total_spent: 8500,  tags: '["铂金客户","游戏达人"]' },
  { nickname: '张美人',   phone: '13800001004', level: 3, balance: 800,   total_recharge: 5000,  total_orders: 10, total_spent: 4200,  tags: '["黄金客户","新客户"]' },
  { nickname: '刘老板',   phone: '13800001005', level: 3, balance: 2000,  total_recharge: 8000,  total_orders: 12, total_spent: 6000,  tags: '["黄金客户","土豪"]' },
  { nickname: '陈科技',   phone: '13800001006', level: 2, balance: 300,   total_recharge: 2000,  total_orders: 5,  total_spent: 1700,  tags: '["白银客户","学生党"]' },
  { nickname: '吴游戏',   phone: '13800001007', level: 2, balance: 500,   total_recharge: 3000,  total_orders: 7,  total_spent: 2500,  tags: '["白银客户","上班族"]' },
  { nickname: '郑新人',   phone: '13800001008', level: 1, balance: 100,   total_recharge: 500,   total_orders: 2,  total_spent: 400,   tags: '["青铜客户","试水"]' },
  { nickname: '小红妹',   phone: '13800001009', level: 1, balance: 50,    total_recharge: 300,   total_orders: 1,  total_spent: 250,   tags: '["青铜客户"]' },
  { nickname: '赵土豪',   phone: '13800001010', level: 5, balance: 10000, total_recharge: 50000, total_orders: 55, total_spent: 40000, tags: '["钻石客户","超级VIP","秒付"]' },
  { nickname: '孙技术',   phone: '13800001011', level: 3, balance: 1200,  total_recharge: 6000,  total_orders: 9,  total_spent: 4800,  tags: '["黄金客户","技术流"]' },
  { nickname: '黄有钱',   phone: '13800001012', level: 4, balance: 4500,  total_recharge: 15000, total_orders: 22, total_spent: 10500, tags: '["铂金客户","大额充值"]' },
];

// 打手数据（16个）
const playersData = [
  { nickname: '刀锋战士',  phone: '13900001001', game_id: 'STEAM001',  game_tier: '宗师',  status: 'online',  skills: '["暗区突围","三角洲行动"]', completed_orders: 45, rating: 4.9,  total_earnings: 9000,  balance: 1500 },
  { nickname: '暗影猎手',  phone: '13900001002', game_id: 'STEAM002',  game_tier: '大师',  status: 'online',  skills: '["瓦罗兰特","暗区突围"]', completed_orders: 32, rating: 4.8,  total_earnings: 6400,  balance: 800  },
  { nickname: '枪神007',   phone: '13900001003', game_id: 'STEAM003',  game_tier: '钻石',  status: 'busy',    skills: '["瓦罗兰特"]',             completed_orders: 68, rating: 5.0,  total_earnings: 13600, balance: 2200 },
  { nickname: '幽灵刺客',  phone: '13900001004', game_id: 'STEAM004',  game_tier: '宗师',  status: 'online',  skills: '["暗区突围","和平精英"]',   completed_orders: 25, rating: 4.7,  total_earnings: 5000,  balance: 600  },
  { nickname: '雷霆战神',  phone: '13900001005', game_id: 'STEAM005',  game_tier: '大师',  status: 'offline', skills: '["三角洲行动","暗区突围"]', completed_orders: 18, rating: 4.6,  total_earnings: 3600,  balance: 400  },
  { nickname: '烈焰女王',  phone: '13900001006', game_id: 'STEAM006',  game_tier: '宗师',  status: 'online',  skills: '["瓦罗兰特","暗区突围"]',   completed_orders: 52, rating: 4.9,  total_earnings: 10400, balance: 1800 },
  { nickname: '风暴突击',  phone: '13900001007', game_id: 'STEAM007',  game_tier: '钻石',  status: 'busy',    skills: '["和平精英"]',             completed_orders: 38, rating: 4.8,  total_earnings: 7600,  balance: 1200 },
  { nickname: '铁血战狼',  phone: '13900001008', game_id: 'STEAM008',  game_tier: '大师',  status: 'offline', skills: '["暗区突围","三角洲行动"]', completed_orders: 15, rating: 4.5,  total_earnings: 3000,  balance: 300  },
  { nickname: '冰霜射手',  phone: '13900001009', game_id: 'STEAM009',  game_tier: '钻石',  status: 'online',  skills: '["瓦罗兰特","和平精英"]',   completed_orders: 41, rating: 4.8,  total_earnings: 8200,  balance: 1100 },
  { nickname: '机械之心',  phone: '13900001010', game_id: 'STEAM010',  game_tier: '宗师',  status: 'offline', skills: '["暗区突围"]',             completed_orders: 22, rating: 4.7,  total_earnings: 4400,  balance: 500  },
  { nickname: '疾风之翼',  phone: '13900001011', game_id: 'STEAM011',  game_tier: '大师',  status: 'online',  skills: '["三角洲行动","瓦罗兰特"]', completed_orders: 30, rating: 4.9,  total_earnings: 6000,  balance: 900  },
  { nickname: '爆破专家',  phone: '13900001012', game_id: 'STEAM012',  game_tier: '钻石',  status: 'busy',    skills: '["暗区突围","和平精英"]',   completed_orders: 48, rating: 4.8,  total_earnings: 9600,  balance: 1400 },
  { nickname: '夜鸦小队',  phone: '13900001013', game_id: 'STEAM013',  game_tier: '大师',  status: 'offline', skills: '["瓦罗兰特","三角洲行动"]', completed_orders: 20, rating: 4.6,  total_earnings: 4000,  balance: 600  },
  { nickname: '沙漠之狐',  phone: '13900001014', game_id: 'STEAM014',  game_tier: '钻石',  status: 'online',  skills: '["暗区突围"]',             completed_orders: 35, rating: 4.7,  total_earnings: 7000,  balance: 1000 },
  { nickname: '新手小白',  phone: '13900001015', game_id: 'STEAM015',  game_tier: '钻石',  status: 'online',  skills: '["暗区突围","和平精英"]',   completed_orders: 5,  rating: 3.8,  total_earnings: 800,   balance: 200  },
  { nickname: '双排搭档',  phone: '13900001016', game_id: 'STEAM016',  game_tier: '宗师',  status: 'offline', skills: '["瓦罗兰特","暗区突围"]',   completed_orders: 12, rating: 4.4,  total_earnings: 2400,  balance: 350  },
];

// 订单数据（22个）
const ordersData = [
  // 待派单（4个）
  { game_type: '暗区突围',   vip_id: 1,  vip_name: '周大福',  vip_phone: '13800001001', current_tier: '青铜III', target_tier: '白银I',  amount: 200,  status: 'pending',   player_ids: null,       player_name: null,         assign_time: null,                           complete_time: null,                           cancel_reason: null, remark: '新客户首单优惠', created_at: formatDateStr(0.5) },
  { game_type: '瓦罗兰特',   vip_id: 4,  vip_name: '张美人',  vip_phone: '13800001004', current_tier: '白银III', target_tier: '黄金I',  amount: 350,  status: 'pending',   player_ids: null,       player_name: null,         assign_time: null,                           complete_time: null,                           cancel_reason: null, remark: '指定枪神007', created_at: formatDateStr(1) },
  { game_type: '三角洲行动', vip_id: 8,  vip_name: '郑新人',  vip_phone: '13800001008', current_tier: '青铜I',   target_tier: '青铜III', amount: 80,   status: 'pending',   player_ids: null,       player_name: null,         assign_time: null,                           complete_time: null,                           cancel_reason: null, remark: '试水单', created_at: formatDateStr(2) },
  { game_type: '和平精英',   vip_id: 9,  vip_name: '小红妹',  vip_phone: '13800001009', current_tier: '青铜II',  target_tier: '白银I',  amount: 150,  status: 'pending',   player_ids: null,       player_name: null,         assign_time: null,                           complete_time: null,                           cancel_reason: null, remark: '', created_at: formatDateStr(3) },

  // 已派单（3个）
  { game_type: '暗区突围',   vip_id: 5,  vip_name: '刘老板',  vip_phone: '13800001005', current_tier: '黄金II',  target_tier: '铂金I',  amount: 600,  status: 'assigned',  player_ids: 1,          player_name: '刀锋战士',   assign_time: formatDateStr(0.5), complete_time: null,                           cancel_reason: null, remark: '老客户指定', created_at: formatDateStr(2) },
  { game_type: '瓦罗兰特',   vip_id: 2,  vip_name: '李明星',  vip_phone: '13800001002', current_tier: '铂金III', target_tier: '钻石I',  amount: 800,  status: 'assigned',  player_ids: 3,          player_name: '枪神007',     assign_time: formatDateStr(0.3), complete_time: null,                           cancel_reason: null, remark: '钻石晋级赛', created_at: formatDateStr(1) },
  { game_type: '三角洲行动', vip_id: 6,  vip_name: '陈科技',  vip_phone: '13800001006', current_tier: '白银I',   target_tier: '黄金III', amount: 280,  status: 'assigned',  player_ids: 2,          player_name: '暗影猎手',   assign_time: formatDateStr(0.2), complete_time: null,                           cancel_reason: null, remark: '速通', created_at: formatDateStr(1) },

  // 进行中（4个）
  { game_type: '暗区突围',   vip_id: 3,  vip_name: '王子豪',  vip_phone: '13800001003', current_tier: '铂金II',  target_tier: '钻石III', amount: 1200, status: 'processing', player_ids: 6,          player_name: '烈焰女王',   assign_time: formatDateStr(0.1), complete_time: null,                           cancel_reason: null, remark: '段位晋级赛', created_at: formatDateStr(1) },
  { game_type: '瓦罗兰特',   vip_id: 7,  vip_name: '吴游戏',  vip_phone: '13800001007', current_tier: '黄金I',   target_tier: '铂金III', amount: 500,  status: 'processing', player_ids: 9,          player_name: '冰霜射手',   assign_time: formatDateStr(0.1), complete_time: null,                           cancel_reason: null, remark: '稳定上分', created_at: formatDateStr(1) },
  { game_type: '和平精英',   vip_id: 11, vip_name: '孙技术',  vip_phone: '13800001011', current_tier: '钻石I',   target_tier: '宗师I',   amount: 1500, status: 'processing', player_ids: 12,         player_name: '爆破专家',   assign_time: formatDateStr(0.1), complete_time: null,                           cancel_reason: null, remark: '难度较高', created_at: formatDateStr(2) },
  { game_type: '暗区突围',   vip_id: 12, vip_name: '黄有钱',  vip_phone: '13800001012', current_tier: '黄金III', target_tier: '铂金I',  amount: 700,  status: 'processing', player_ids: 4,          player_name: '幽灵刺客',   assign_time: formatDateStr(0.1), complete_time: null,                           cancel_reason: null, remark: '', created_at: formatDateStr(3) },

  // 已完成（7个）
  { game_type: '暗区突围',   vip_id: 1,  vip_name: '周大福',  vip_phone: '13800001001', current_tier: '白银II',  target_tier: '黄金I',  amount: 400,  status: 'completed', player_ids: 1,          player_name: '刀锋战士',   assign_time: formatDateStr(10), complete_time: formatDateStr(9),  cancel_reason: null, remark: '顺利通关', created_at: formatDateStr(10) },
  { game_type: '瓦罗兰特',   vip_id: 2,  vip_name: '李明星',  vip_phone: '13800001002', current_tier: '黄金III', target_tier: '铂金I',  amount: 600,  status: 'completed', player_ids: 3,          player_name: '枪神007',     assign_time: formatDateStr(8),  complete_time: formatDateStr(7),  cancel_reason: null, remark: '', created_at: formatDateStr(8) },
  { game_type: '三角洲行动', vip_id: 5,  vip_name: '刘老板',  vip_phone: '13800001005', current_tier: '铂金I',   target_tier: '钻石III', amount: 1000, status: 'completed', player_ids: 11,         player_name: '疾风之翼',   assign_time: formatDateStr(15), complete_time: formatDateStr(14), cancel_reason: null, remark: '超快完成', created_at: formatDateStr(15) },
  { game_type: '和平精英',   vip_id: 3,  vip_name: '王子豪',  vip_phone: '13800001003', current_tier: '钻石II',  target_tier: '宗师I',  amount: 1800, status: 'completed', player_ids: '6,9',      player_name: '烈焰女王/冰霜射手', assign_time: formatDateStr(20), complete_time: formatDateStr(18), cancel_reason: null, remark: '双排上分', created_at: formatDateStr(20) },
  { game_type: '暗区突围',   vip_id: 10, vip_name: '赵土豪',  vip_phone: '13800001010', current_tier: '黄金I',   target_tier: '钻石III', amount: 2000, status: 'completed', player_ids: '1,6',      player_name: '刀锋战士/烈焰女王', assign_time: formatDateStr(25), complete_time: formatDateStr(23), cancel_reason: null, remark: '超级大单', created_at: formatDateStr(25) },
  { game_type: '瓦罗兰特',   vip_id: 4,  vip_name: '张美人',  vip_phone: '13800001004', current_tier: '白银I',   target_tier: '黄金II',  amount: 320,  status: 'completed', player_ids: 2,          player_name: '暗影猎手',   assign_time: formatDateStr(30), complete_time: formatDateStr(28), cancel_reason: null, remark: '', created_at: formatDateStr(30) },
  { game_type: '暗区突围',   vip_id: 7,  vip_name: '吴游戏',  vip_phone: '13800001007', current_tier: '青铜III', target_tier: '白银I',  amount: 180,  status: 'completed', player_ids: 4,          player_name: '幽灵刺客',   assign_time: formatDateStr(35), complete_time: formatDateStr(34), cancel_reason: null, remark: '新手任务', created_at: formatDateStr(35) },

  // 已取消（4个）
  { game_type: '瓦罗兰特',   vip_id: 6,  vip_name: '陈科技',  vip_phone: '13800001006', current_tier: '白银II',  target_tier: '黄金I',  amount: 300,  status: 'cancelled', player_ids: null,       player_name: null,         assign_time: null,                           complete_time: null,                           cancel_reason: '客户临时取消', remark: '', created_at: formatDateStr(5) },
  { game_type: '三角洲行动', vip_id: 9,  vip_name: '小红妹',  vip_phone: '13800001009', current_tier: '青铜I',   target_tier: '白银III', amount: 120,  status: 'cancelled', player_ids: 5,          player_name: '雷霆战神',   assign_time: formatDateStr(4),  complete_time: null,                           cancel_reason: '打手临时有事', remark: '', created_at: formatDateStr(4) },
  { game_type: '暗区突围',   vip_id: 8,  vip_name: '郑新人',  vip_phone: '13800001008', current_tier: '青铜I',   target_tier: '青铜III', amount: 80,   status: 'cancelled', player_ids: null,       player_name: null,         assign_time: null,                           complete_time: null,                           cancel_reason: '余额不足', remark: '退款处理中', created_at: formatDateStr(6) },
  { game_type: '和平精英',   vip_id: 11, vip_name: '孙技术',  vip_phone: '13800001011', current_tier: '黄金II',  target_tier: '铂金I',  amount: 550,  status: 'cancelled', player_ids: 7,          player_name: '风暴突击',   assign_time: formatDateStr(3),  complete_time: null,                           cancel_reason: '游戏维护', remark: '', created_at: formatDateStr(3) },
];

// 结算记录数据
const settlementsData = [
  { order_id: 11, player_id: 1,  gross_amount: 400,  studio_fee: 40,  manager_fee: 20, tips: 10,  net_amount: 350,  status: 'paid', paid_at: formatDateStr(8) },
  { order_id: 12, player_id: 3,  gross_amount: 600,  studio_fee: 60,  manager_fee: 30, tips: 20,  net_amount: 530,  status: 'paid', paid_at: formatDateStr(6) },
  { order_id: 13, player_id: 11, gross_amount: 1000, studio_fee: 100, manager_fee: 50, tips: 50,  net_amount: 900,  status: 'paid', paid_at: formatDateStr(12) },
  { order_id: 14, player_id: 6,  gross_amount: 900,  studio_fee: 90,  manager_fee: 45, tips: 30,  net_amount: 795,  status: 'paid', paid_at: formatDateStr(16) },
  { order_id: 14, player_id: 9,  gross_amount: 900,  studio_fee: 90,  manager_fee: 45, tips: 30,  net_amount: 795,  status: 'paid', paid_at: formatDateStr(16) },
  { order_id: 15, player_id: 1,  gross_amount: 1000, studio_fee: 100, manager_fee: 50, tips: 100, net_amount: 950,  status: 'paid', paid_at: formatDateStr(22) },
  { order_id: 15, player_id: 6,  gross_amount: 1000, studio_fee: 100, manager_fee: 50, tips: 100, net_amount: 950,  status: 'paid', paid_at: formatDateStr(22) },
  { order_id: 16, player_id: 2,  gross_amount: 320,  studio_fee: 32,  manager_fee: 16, tips: 0,   net_amount: 272,  status: 'paid', paid_at: formatDateStr(27) },
  { order_id: 17, player_id: 4,  gross_amount: 180,  studio_fee: 18,  manager_fee: 9,  tips: 0,   net_amount: 153,  status: 'paid', paid_at: formatDateStr(33) },
  { order_id: 8,  player_id: 6,  gross_amount: 1200, studio_fee: 120, manager_fee: 60, tips: 50,  net_amount: 1070, status: 'pending', paid_at: null },
  { order_id: 9,  player_id: 9,  gross_amount: 500,  studio_fee: 50,  manager_fee: 25, tips: 10,  net_amount: 435,  status: 'pending', paid_at: null },
  { order_id: 10, player_id: 12, gross_amount: 1500, studio_fee: 150, manager_fee: 75, tips: 100, net_amount: 1375, status: 'pending', paid_at: null },
  { order_id: 11, player_id: 4,  gross_amount: 700,  studio_fee: 70,  manager_fee: 35, tips: 20,  net_amount: 615,  status: 'pending', paid_at: null },
];

function seedData() {
  const db = getDatabase();

  // ========== 1. 管理员 ==========
  const existingAdmin = db.get('SELECT id FROM users WHERE username = ?', 'admin');
  if (!existingAdmin) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT INTO users (username, password, nickname, role) VALUES (?, ?, ?, ?)`, 
      'admin', hashedPassword, '管理员', 'admin');
    console.log('✅ 默认管理员账号创建: admin / admin123');
  } else {
    console.log('ℹ️  管理员已存在，跳过');
  }

  // ========== 2. 打手 ==========
  const playerCount = db.get('SELECT COUNT(*) as count FROM players');
  if (!playerCount || playerCount.count === 0) {
    playersData.forEach(p => {
      db.run(`INSERT INTO players (nickname, phone, game_id, game_tier, status, skills, completed_orders, rating, total_earnings, balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        p.nickname, p.phone, p.game_id, p.game_tier, p.status, p.skills, p.completed_orders, p.rating, p.total_earnings, p.balance);
    });
    console.log(`✅ 打手数据创建完成 (${playersData.length}条)`);
  } else {
    console.log(`ℹ️  打手已存在(${playerCount.count}条)，跳过`);
  }

  // ========== 3. VIP客户 ==========
  const vipCount = db.get('SELECT COUNT(*) as count FROM vips');
  if (!vipCount || vipCount.count === 0) {
    vipsData.forEach(v => {
      db.run(`INSERT INTO vips (nickname, phone, level, balance, total_recharge, total_orders, total_spent, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        v.nickname, v.phone, v.level, v.balance, v.total_recharge, v.total_orders, v.total_spent, v.tags);
    });
    console.log(`✅ VIP客户数据创建完成 (${vipsData.length}条)`);
  } else {
    console.log(`ℹ️  VIP已存在(${vipCount.count}条)，跳过`);
  }

  // ========== 4. 订单 ==========
  const orderCount = db.get('SELECT COUNT(*) as count FROM orders');
  if (!orderCount || orderCount.count === 0) {
    ordersData.forEach(o => {
      const orderNo = generateOrderNo();
      db.run(`INSERT INTO orders (order_no, game_type, vip_id, vip_name, vip_phone, current_tier, target_tier, amount, status, player_ids, player_name, assign_time, complete_time, cancel_reason, remark, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        orderNo, o.game_type, o.vip_id, o.vip_name, o.vip_phone, o.current_tier, o.target_tier, o.amount, o.status, o.player_ids, o.player_name, o.assign_time, o.complete_time, o.cancel_reason, o.remark, o.created_at);
    });
    console.log(`✅ 订单数据创建完成 (${ordersData.length}条)`);
  } else {
    console.log(`ℹ️  订单已存在(${orderCount.count}条)，跳过`);
  }

  // ========== 5. 结算记录 ==========
  const settlementCount = db.get('SELECT COUNT(*) as count FROM settlements');
  if (!settlementCount || settlementCount.count === 0) {
    settlementsData.forEach(s => {
      db.run(`INSERT INTO settlements (order_id, player_id, gross_amount, studio_fee, manager_fee, tips, net_amount, status, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        s.order_id, s.player_id, s.gross_amount, s.studio_fee, s.manager_fee, s.tips, s.net_amount, s.status, s.paid_at);
    });
    console.log(`✅ 结算记录创建完成 (${settlementsData.length}条)`);
  } else {
    console.log(`ℹ️  结算记录已存在(${settlementCount.count}条)，跳过`);
  }

  // ========== 打印汇总 ==========
  console.log('\n📊 种子数据汇总:');
  const stats = {
    users:        db.get('SELECT COUNT(*) as c FROM users')?.c || 0,
    players:      db.get('SELECT COUNT(*) as c FROM players')?.c || 0,
    vips:         db.get('SELECT COUNT(*) as c FROM vips')?.c || 0,
    orders:       db.get('SELECT COUNT(*) as c FROM orders')?.c || 0,
    settlements:  db.get('SELECT COUNT(*) as c FROM settlements')?.c || 0,
  };
  console.log(`   用户:     ${stats.users} 条`);
  console.log(`   打手:     ${stats.players} 条`);
  console.log(`   VIP客户:  ${stats.vips} 条`);
  console.log(`   订单:     ${stats.orders} 条`);
  console.log(`   结算记录: ${stats.settlements} 条`);
  console.log('\n🎉 种子数据初始化完成\n');
}

module.exports = { seedData };
