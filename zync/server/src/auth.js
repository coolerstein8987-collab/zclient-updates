import crypto from 'node:crypto';
import { q } from './db.js';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  q.run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', token, userId, Date.now());
  return token;
}

export function userFromToken(token) {
  if (!token) return null;
  return q.get('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?', token) || null;
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = userFromToken(token);
  if (!user) return res.status(401).json({ error: 'Nicht angemeldet' });
  req.user = user;
  req.token = token;
  next();
}

// Einfaches In-Memory-Rate-Limit pro Schlüssel (z. B. IP + Route).
const buckets = new Map();
export function rateLimit({ windowMs, max, key = (req) => req.ip }) {
  return (req, res, next) => {
    const k = `${req.baseUrl}${req.path}:${key(req)}`;
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || b.reset < now) {
      b = { count: 0, reset: now + windowMs };
      buckets.set(k, b);
    }
    b.count += 1;
    if (b.count > max) return res.status(429).json({ error: 'Zu viele Anfragen – kurz warten.' });
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000).unref();
