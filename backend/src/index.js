import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, get, run } from './db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import tagRoutes from './routes/tags.js';
import messageRoutes from './routes/messages.js';
import uploadRoutes from './routes/uploads.js';
import notificationRoutes from './routes/notifications.js';
import { hashPassword } from './auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// 啟動 DB
initDb();

// 首次啟動：建立 admin 帳號（若尚未有任何使用者）
(async () => {
  const row = await get('SELECT COUNT(*) as cnt FROM users');
  if (row?.cnt === 0) {
    const adminPass = process.env.ADMIN_PASSWORD || 'ChangeMeAdmin123!';
    const hash = await hashPassword(adminPass);
    await run('INSERT INTO users (username, password_hash, display_name, role) VALUES (?,?,?,?)', [
      'admin', hash, 'Administrator', 'admin'
    ]);
    console.log('[init] Created default admin user: admin / (password from env ADMIN_PASSWORD)');
  }
})();

// 靜態提供 uploads（給 nginx 反代）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);

// 健康檢查
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Backend listening on :${PORT}`);
});