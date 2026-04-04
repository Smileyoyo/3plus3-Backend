# 3Plus3俱乐部后台管理系统

## 简介

3Plus3俱乐部后台管理系统后端服务，提供订单管理、打手管理、VIP管理、结算管理等核心功能。

## 技术栈

- **运行时**: Node.js
- **框架**: Express.js
- **数据库**: SQLite (better-sqlite3)
- **认证**: JWT (jsonwebtoken)
- **实时通信**: WebSocket (ws)
- **密码加密**: bcryptjs
- **限流**: express-rate-limit

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
npm start
```

服务将在 http://localhost:18789 启动

### 默认管理员账号

- 用户名: admin
- 密码: admin123

## API接口

### 认证接口 `/api/auth`

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | /login | 登录 |
| POST | /logout | 登出 |
| GET | /user | 获取当前用户 |
| POST | /change-password | 修改密码 |

### 订单接口 `/api/orders`

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | / | 订单列表 |
| GET | /:id | 订单详情 |
| POST | / | 创建订单 |
| PUT | /:id | 更新订单 |
| POST | /:id/assign | 派单 |
| POST | /:id/complete | 完成订单 |
| POST | /:id/cancel | 取消订单 |
| GET | /export | 导出订单 |

### 结算接口 `/api/settlements`

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | / | 结算列表 |
| GET | /logs | 结算日志 |
| POST | / | 创建结算 |
| POST | /:id/approve | 审核 |
| POST | /:id/pay | 执行付款 |
| POST | /:id/tips | 添加鸡腿 |

### 打手接口 `/api/players`

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | / | 打手列表 |
| GET | /stats | 统计 |
| GET | /:id | 打手详情 |
| POST | / | 创建打手 |
| PUT | /:id | 更新打手 |
| PUT | /:id/status | 更新状态 |

### VIP接口 `/api/vips`

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /levels | 等级列表 |
| GET | / | VIP列表 |
| GET | /:id | VIP详情 |
| POST | / | 创建VIP |
| PUT | /:id | 更新VIP |
| POST | /:id/recharge | 充值 |

### 用户接口 `/api/users` (仅管理员)

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | / | 用户列表 |
| POST | / | 创建用户 |
| PUT | /:id | 更新用户 |
| DELETE | /:id | 删除用户 |

### 统计接口 `/api/stats`

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /dashboard | 仪表盘数据 |
| GET | /orders | 订单统计 |
| GET | /revenue | 营收统计 |

## WebSocket

连接地址: `ws://localhost:18789/ws`

### 事件

| 事件 | 描述 |
|------|------|
| new_order | 新订单 |
| order_update | 订单更新 |
| player_status | 打手状态变更 |
| settlement_update | 结算更新 |
| notification | 系统通知 |

## 数据库

使用SQLite数据库，文件位于 `data/3plus3.db`

### 主要表结构

- **users** - 用户表
- **players** - 打手表
- **vips** - VIP表
- **orders** - 订单表
- **settlements** - 结算表
- **settlement_logs** - 结算日志表
- **order_locks** - 订单锁表

## 并发控制

系统实现了多层并发控制机制：

1. **乐观锁** - 订单更新时检查版本号
2. **悲观锁** - 结算操作使用数据库事务
3. **请求限流** - 全局限流 + 结算接口专项限流
4. **操作锁表** - 防止同一订单被多人同时操作

## 安全特性

- JWT认证
- bcrypt密码加密
- 请求限流防刷
- 角色权限控制
- 统一错误处理

## 响应格式

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

## 许可证

MIT
