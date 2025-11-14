import { Router } from 'express';
import { all, get, run } from '../db.js';
import { authRequired, comparePassword, hashPassword, signToken, cookieOpts } from '../auth.js';

const router = Router();

// 註冊
router.post('/register', async (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password) return res.status(400).json({ error: '缺少帳號或密碼' });
    const exists = await get('SELECT id FROM users WHERE username = ?', [username]);
    if (exists) return res.status(409).json({ error: '帳號已存在' });

    const hash = await hashPassword(password);
    const display = displayName?.trim() || username;
    const { id } = await run(
      'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)',
      [username, hash, display, 'user']
    );
    const user = await get('SELECT id, username, display_name, role, theme FROM users WHERE id = ?', [id]);
    const token = signToken(user);
    res.cookie('token', token, cookieOpts);
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: '註冊失敗' });
  }
});

// 登入
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '缺少帳號或密碼' });
    const user = await get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(404).json({ error: '尚未擁有帳號，請先註冊' });
    const ok = await comparePassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: '密碼錯誤' });
    const payload = {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      theme: user.theme
    };
    const token = signToken(payload);
    res.cookie('token', token, cookieOpts);
    res.json(payload);
  } catch {
    res.status(500).json({ error: '登入失敗' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ ok: true });
});

router.get('/me', authRequired, async (req, res) => {
  res.json(req.user);
});

export default router;