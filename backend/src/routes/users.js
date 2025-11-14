import { Router } from 'express';
import { authRequired, hashPassword, requireRole } from '../auth.js';
import { get, run } from '../db.js';

const router = Router();

// 取得使用者資訊
router.get('/:id', authRequired, async (req, res) => {
  const user = await get('SELECT id, username, display_name, role, theme, created_at FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: '使用者不存在' });
  res.json(user);
});

// 更新個人設定
router.put('/me', authRequired, async (req, res) => {
  const { display_name, password, theme } = req.body;
  if (display_name) {
    await run('UPDATE users SET display_name = ?, updated_at = datetime("now") WHERE id = ?', [display_name, req.user.id]);
  }
  if (typeof theme === 'string') {
    await run('UPDATE users SET theme = ?, updated_at = datetime("now") WHERE id = ?', [theme, req.user.id]);
  }
  if (password) {
    const hash = await hashPassword(password);
    await run('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?', [hash, req.user.id]);
  }
  const user = await get('SELECT id, username, display_name, role, theme FROM users WHERE id = ?', [req.user.id]);
  res.json(user);
});

// 管理員：調整角色 — 必須先驗證登入再檢查角色
router.put('/:id/role', authRequired, requireRole('admin'), async (req, res) => {
  const { role } = req.body;
  if (!['admin', 'moderator', 'user'].includes(role)) return res.status(400).json({ error: '不支援的角色' });
  await run('UPDATE users SET role = ?, updated_at = datetime("now") WHERE id = ?', [role, req.params.id]);
  const user = await get('SELECT id, username, display_name, role FROM users WHERE id = ?', [req.params.id]);
  res.json(user);
});

export default router;