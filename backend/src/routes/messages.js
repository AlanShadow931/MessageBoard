import { Router } from 'express';
import { all, get, run } from '../db.js';
import { authRequired, requireRole } from '../auth.js';
import { notify } from '../utils/notify.js';

const router = Router();

function shapeMessage(m) {
  return {
    id: m.id,
    content: m.content,
    parent_id: m.parent_id,
    created_at: m.created_at,
    updated_at: m.updated_at,
    edited: !!m.edited,
    author: {
      id: m.user_id,
      username: m.username,
      display_name: m.display_name,
      role: m.role
    },
    likes: m.likes ?? 0,
    dislikes: m.dislikes ?? 0,
    tags: m.tags ? m.tags.split(',').filter(Boolean).map(Number) : []
  };
}

// 搜尋/列表
router.get('/', async (req, res) => {
  const { q = '', tagId = '', parent = '' } = req.query;
  const filters = [];
  const params = [];

  if (q) {
    filters.push('m.content LIKE ?');
    params.push(`%${q}%`);
  }
  if (tagId) {
    filters.push('EXISTS (SELECT 1 FROM message_tag_map mt WHERE mt.message_id = m.id AND mt.tag_id = ?)');
    params.push(tagId);
  }
  if (parent !== '') {
    if (parent === 'null') {
      filters.push('m.parent_id IS NULL');
    } else {
      filters.push('m.parent_id = ?');
      params.push(parent);
    }
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await all(
    `
    SELECT m.*, u.username, u.display_name, u.role,
      COALESCE(SUM(CASE WHEN l.value=1 THEN 1 ELSE 0 END),0) as likes,
      COALESCE(SUM(CASE WHEN l.value=-1 THEN 1 ELSE 0 END),0) as dislikes,
      (SELECT GROUP_CONCAT(tag_id) FROM message_tag_map mt WHERE mt.message_id = m.id) as tags
    FROM messages m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN likes l ON l.message_id = m.id
    ${where}
    GROUP BY m.id
    ORDER BY m.created_at DESC
    `
    , params
  );

  res.json(rows.map(shapeMessage));
});

// 新增留言
router.post('/', authRequired, async (req, res) => {
  const { content, parent_id } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: '內容不得為空' });
  const { id } = await run(
    'INSERT INTO messages (user_id, content, parent_id) VALUES (?, ?, ?)',
    [req.user.id, content.trim(), parent_id || null]
  );
  const m = await get(
    `SELECT m.*, u.username, u.display_name, u.role FROM messages m JOIN users u ON u.id=m.user_id WHERE m.id = ?`,
    [id]
  );

  // 如果是回覆，通知被回覆的作者
  if (m.parent_id) {
    const parent = await get('SELECT user_id FROM messages WHERE id = ?', [m.parent_id]);
    if (parent?.user_id && parent.user_id !== req.user.id) {
      await run('INSERT INTO notifications (user_id, type, data) VALUES (?,?,?)', [
        parent.user_id, 'reply', JSON.stringify({ messageId: id })
      ]);
      notify(parent.user_id, 'reply', { messageId: id });
    }
  }

  res.json(shapeMessage({ ...m, likes: 0, dislikes: 0, tags: '' }));
});

// 編輯留言（作者或管理員/版主）
router.put('/:id', authRequired, async (req, res) => {
  const { content } = req.body;
  const msg = await get('SELECT * FROM messages WHERE id = ?', [req.params.id]);
  if (!msg) return res.status(404).json({ error: '留言不存在' });
  const isOwner = msg.user_id === req.user.id;
  const isStaff = ['admin', 'moderator'].includes(req.user.role);
  if (!isOwner && !isStaff) return res.status(403).json({ error: '無權限編輯' });
  await run('UPDATE messages SET content = ?, edited = 1, updated_at = datetime("now") WHERE id = ?', [content, req.params.id]);
  const updated = await get(
    `SELECT m.*, u.username, u.display_name, u.role FROM messages m JOIN users u ON u.id=m.user_id WHERE m.id = ?`,
    [req.params.id]
  );
  res.json(shapeMessage({ ...updated, likes: 0, dislikes: 0, tags: '' }));
});

// 刪除留言（管理員/版主 或 作者）
router.delete('/:id', authRequired, async (req, res) => {
  const msg = await get('SELECT * FROM messages WHERE id = ?', [req.params.id]);
  if (!msg) return res.status(404).json({ error: '留言不存在' });
  const isOwner = msg.user_id === req.user.id;
  const isStaff = ['admin', 'moderator'].includes(req.user.role);
  if (!isOwner && !isStaff) return res.status(403).json({ error: '無權限刪除' });
  await run('DELETE FROM messages WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// 讚/倒讚
router.post('/:id/like', authRequired, async (req, res) => {
  const { value } = req.body; // 1, -1, 0(取消)
  const msg = await get('SELECT * FROM messages WHERE id = ?', [req.params.id]);
  if (!msg) return res.status(404).json({ error: '留言不存在' });
  if (![1, -1, 0].includes(value)) return res.status(400).json({ error: 'value 必須是 1, -1 或 0' });

  const existing = await get('SELECT * FROM likes WHERE message_id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (value === 0) {
    if (existing) await run('DELETE FROM likes WHERE id = ?', [existing.id]);
  } else {
    if (existing) {
      await run('UPDATE likes SET value = ? WHERE id = ?', [value, existing.id]);
    } else {
      await run('INSERT INTO likes (message_id, user_id, value) VALUES (?, ?, ?)', [req.params.id, req.user.id, value]);
    }
  }

  // 通知作者（非自己）
  if (msg.user_id !== req.user.id) {
    await run('INSERT INTO notifications (user_id, type, data) VALUES (?,?,?)', [
      msg.user_id, 'reaction', JSON.stringify({ messageId: msg.id, value })
    ]);
    notify(msg.user_id, 'reaction', { messageId: msg.id, value });
  }

  res.json({ ok: true });
});

// 檢舉
router.post('/:id/report', authRequired, async (req, res) => {
  const { reason } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: '請提供檢舉理由' });
  await run('INSERT INTO reports (message_id, user_id, reason) VALUES (?,?,?)', [req.params.id, req.user.id, reason.trim()]);
  res.json({ ok: true });
});

// 列出回覆
router.get('/:id/replies', async (req, res) => {
  const rows = await all(
    `SELECT m.*, u.username, u.display_name, u.role,
    COALESCE(SUM(CASE WHEN l.value=1 THEN 1 ELSE 0 END),0) as likes,
    COALESCE(SUM(CASE WHEN l.value=-1 THEN 1 ELSE 0 END),0) as dislikes,
    (SELECT GROUP_CONCAT(tag_id) FROM message_tag_map mt WHERE mt.message_id = m.id) as tags
    FROM messages m
    JOIN users u ON u.id=m.user_id
    LEFT JOIN likes l ON l.message_id = m.id
    WHERE m.parent_id = ?
    GROUP BY m.id
    ORDER BY m.created_at ASC`,
    [req.params.id]
  );
  res.json(rows.map(shapeMessage));
});

export default router;