import { Router } from 'express';
import { authRequired } from '../auth.js';
import { all, run } from '../db.js';
import { subscribe } from '../utils/notify.js';

const router = Router();

// SSE stream
router.get('/stream', authRequired, async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.write('retry: 10000\n\n');
  subscribe(req.user.id, res);
});

// 未讀列表
router.get('/', authRequired, async (req, res) => {
  const rows = await all('SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 100', [req.user.id]);
  res.json(rows.map(r => ({ ...r, data: JSON.parse(r.data) })));
});

// 標記已讀
router.post('/read', authRequired, async (req, res) => {
  await run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ ok: true });
});

export default router;