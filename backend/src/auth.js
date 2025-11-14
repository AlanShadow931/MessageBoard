import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: false, // 若有 HTTPS 請改為 true
  path: '/',
  maxAge: 7 * 24 * 3600 * 1000
};

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function authRequired(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: '未登入' });
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch {
    res.status(401).json({ error: '登入已過期，請重新登入' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '未登入' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '權限不足' });
    }
    next();
  };
}

export async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

export async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export const cookieOpts = COOKIE_OPTS;