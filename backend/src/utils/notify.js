// 簡單的 SSE 訂閱管理
const clients = new Map(); // userId => Set(res)

export function subscribe(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  res.on('close', () => {
    clients.get(userId)?.delete(res);
  });
}

export function pushToUser(userId, event) {
  const subs = clients.get(userId);
  if (!subs || subs.size === 0) return;
  const data = JSON.stringify(event);
  for (const res of subs) {
    res.write(`data: ${data}\n\n`);
  }
}

// 方便業務使用：push 通知
export function notify(userId, type, payload) {
  pushToUser(userId, { type, payload, ts: Date.now() });
}