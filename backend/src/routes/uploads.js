import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRequired } from '../auth.js';
import { run } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    cb(null, `${ts}_${safe}`);
  }
});
const upload = multer({ storage });

const router = Router();

router.post('/', authRequired, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到檔案' });
  const relative = `/uploads/${req.file.filename}`;
  await run('INSERT INTO images (uploaded_by, path) VALUES (?, ?)', [req.user.id, relative]);
  res.json({ url: relative });
});

export default router;