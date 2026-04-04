const WebSocket = require('ws');

let wss = null;

function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    console.log('WebSocket客户端连接');

    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        handleMessage(ws, data);
      } catch (err) {
        console.error('WebSocket消息解析失败:', err);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket客户端断开');
    });

    ws.on('error', (err) => {
      console.error('WebSocket错误:', err);
    });

    // 发送欢迎消息
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket连接成功'
    }));
  });

  // 心跳检测
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  console.log('WebSocket服务已启动');
}

// 处理客户端消息
function handleMessage(ws, data) {
  switch (data.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    case 'subscribe':
      // 客户端订阅特定事件
      ws.subscriptions = ws.subscriptions || [];
      ws.subscriptions.push(data.event);
      ws.send(JSON.stringify({ type: 'subscribed', event: data.event }));
      break;
    default:
      console.log('收到未知消息类型:', data.type);
  }
}

// 广播消息给所有客户端
function broadcast(event, data) {
  if (!wss) return;

  const message = JSON.stringify({
    type: event,
    data: data,
    timestamp: new Date().toISOString()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      // 如果客户端有订阅，检查是否订阅了此事件
      if (!client.subscriptions || client.subscriptions.includes(event) || client.subscriptions.includes('*')) {
        client.send(message);
      }
    }
  });
}

// 发送给特定客户端
function sendTo(clientId, event, data) {
  if (!wss) return;

  const message = JSON.stringify({
    type: event,
    data: data,
    timestamp: new Date().toISOString()
  });

  wss.clients.forEach((client) => {
    if (client.clientId === clientId && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// 获取WebSocket服务器实例
function getWebSocketServer() {
  return {
    broadcast,
    sendTo,
    getClients: () => wss ? wss.clients : []
  };
}

module.exports = { initWebSocket, getWebSocketServer, broadcast };
