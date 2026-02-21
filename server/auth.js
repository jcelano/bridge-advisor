import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, getOne, getAll } from './db.js';

// ── Config ────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'bridge-advisor-dev-secret-change-me';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

// ── Password Hashing ──────────────────────────────────────────
export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// ── JWT Tokens ────────────────────────────────────────────────
export function generateToken(user) {
  return jwt.sign(
    { email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ── User CRUD ─────────────────────────────────────────────────
export async function createUser(email, password, name) {
  const existing = await getOne('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (existing) throw new Error(`User ${email} already exists`);

  const hashed = await hashPassword(password);
  const result = await getOne(
    'INSERT INTO users (email, password, name) VALUES (LOWER($1), $2, $3) RETURNING email, name',
    [email, hashed, name || email.split('@')[0]]
  );
  return result;
}

export async function removeUser(email) {
  const result = await query('DELETE FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (result.rowCount === 0) throw new Error(`User ${email} not found`);
}

export async function listUsers() {
  return getAll('SELECT email, name, created_at FROM users ORDER BY created_at');
}

export async function findUser(email) {
  return getOne('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
}

// ── Login ─────────────────────────────────────────────────────
export async function loginUser(email, password) {
  console.log('loginUser', email, password);

  const user = await findUser(email);
  if (!user) throw new Error('Invalid email or password');

  const valid = await verifyPassword(password, user.password);
  if (!valid) throw new Error('Invalid email or password');



  return {
    token: generateToken(user),
    user: { email: user.email, name: user.name },
  };
}

// ── Express Middleware ─────────────────────────────────────────
export function requireAuth(req, res, next) {
  if (process.env.AUTH_ENABLED === 'false') return next();

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const decoded = verifyToken(header.split(' ')[1]);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }

  req.user = decoded;
  next();
}
