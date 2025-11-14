import { Router } from 'express';
import { all, get, run } from '../db.js';
import { authRequired, requireRole } from '../auth.js';

const router = Router();

// 列出所有標籤
router.get('/', async (req, res) => {
  const tags = await all('SELECT * FROM tags ORDER BY name ASC');
  res.json(tags);
});

// 新增標籤（版主以上）— 必須先驗證登入再檢查角色
router.post('/', authRequired, requireRole('admin', 'moderator'), async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '標籤名稱不得為空' });
  try {
    const { id } = await run('INSERT INTO tags (name) VALUES (?)', [name.trim()]);
    const tag = await get('SELECT * FROM tags WHERE id = ?', [id]);
    res.json(tag);
  } catch (e) {
    res.status(409).json({ error: '標籤已存在' });
  }
});

// 將標籤套用到留言
router.post('/apply', authRequired, async (req, res) => {
  const { message_id, tag_ids } = req.body;
  if (!message_id || !Array.isArray(tag_ids)) return res.status(400).json({ error: '參數錯誤' });
  await run('DELETE FROM message_tag_map WHERE message_id = ?', [message_id]);
  for (const tid of tag_ids) {
    await run('INSERT OR IGNORE INTO message_tag_map (message_id, tag_id) VALUES (?, ?)', [message_id, tid]);
  }
  res.json({ ok: true });
});

export default router;