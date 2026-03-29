import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
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
    { email: user.email, name: user.name, tier: user.tier || 'free' },
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
export async function createUser(email, password, name, { approved = false, tier = 'free', dailyLimit = 10 } = {}) {
  const existing = await getOne('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (existing) throw new Error(`User ${email} already exists`);

  const hashed = await hashPassword(password);
  const result = await getOne(
    `INSERT INTO users (email, password, name, approved, tier, daily_limit)
     VALUES (LOWER($1), $2, $3, $4, $5, $6)
     RETURNING email, name, tier, daily_limit, approved`,
    [email, hashed, name || email.split('@')[0], approved, tier, dailyLimit]
  );
  return result;
}

export async function removeUser(email) {
  const result = await query('DELETE FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (result.rowCount === 0) throw new Error(`User ${email} not found`);
}

export async function listUsers() {
  return getAll('SELECT email, name, tier, daily_limit, approved, created_at FROM users ORDER BY created_at');
}

export async function findUser(email) {
  return getOne('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
}

// ── Invite Codes ────────────────────────────────────────────────
export function generateInviteCode() {
  return crypto.randomBytes(6).toString('base64url'); // 8-char URL-safe code
}

export async function createInviteCode(createdBy, { tier = 'free', uses = 1, expiresInDays = null } = {}) {
  const code = generateInviteCode();
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
    : null;

  return getOne(
    `INSERT INTO invite_codes (code, created_by, tier, uses_remaining, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING code, tier, uses_remaining, expires_at, created_at`,
    [code, createdBy, tier, uses, expiresAt]
  );
}

export async function redeemInviteCode(code) {
  const invite = await getOne(
    `SELECT * FROM invite_codes
     WHERE code = $1 AND uses_remaining > 0 AND used_by IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [code]
  );
  if (!invite) return null;
  return invite;
}

export async function markInviteUsed(code, email) {
  await query(
    `UPDATE invite_codes SET uses_remaining = uses_remaining - 1, used_by = $2
     WHERE code = $1`,
    [code, email]
  );
}

export async function listInviteCodes() {
  return getAll(
    `SELECT code, tier, uses_remaining, used_by, expires_at, created_at
     FROM invite_codes ORDER BY created_at DESC`
  );
}

// ── Admin Operations ────────────────────────────────────────────
export async function approveUser(email, { tier, dailyLimit } = {}) {
  const sets = ['approved = true'];
  const params = [email];
  let idx = 2;

  if (tier) { sets.push(`tier = $${idx++}`); params.push(tier); }
  if (dailyLimit) { sets.push(`daily_limit = $${idx++}`); params.push(dailyLimit); }

  const result = await query(
    `UPDATE users SET ${sets.join(', ')} WHERE LOWER(email) = LOWER($1)`,
    params
  );
  if (result.rowCount === 0) throw new Error(`User ${email} not found`);
}

export async function getPendingUsers() {
  return getAll(
    `SELECT email, name, created_at FROM users WHERE approved = false ORDER BY created_at`
  );
}

// ── Admin guard middleware ───────────────────────────────────────
export function requireAdmin(req, res, next) {
  if (process.env.AUTH_ENABLED === 'false') return next();

  // requireAuth must run first and set req.user
  if (!req.user?.tier || req.user.tier !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ── Login ─────────────────────────────────────────────────────
export async function loginUser(email, password) {
  const user = await findUser(email);
  if (!user) throw new Error('Invalid email or password');

  const valid = await verifyPassword(password, user.password);
  if (!valid) throw new Error('Invalid email or password');

  if (!user.approved) throw new Error('Account pending approval');

  return {
    token: generateToken(user),
    user: { email: user.email, name: user.name, tier: user.tier, dailyLimit: user.daily_limit },
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
