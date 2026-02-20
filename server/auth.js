import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');
const USERS_FILE = join(DATA_DIR, 'users.json');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// ── Config ────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'bridge-advisor-dev-secret-change-me';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

// ── User Storage (JSON file — fine for 2-10 users) ───────────
export function loadUsers() {
  let users = [];

  // 1. Load users from the JSON file
  if (existsSync(USERS_FILE)) {
    try {
      users = JSON.parse(readFileSync(USERS_FILE, 'utf-8'));
    } catch {
      users = [];
    }
  }

  // 2. Inject the GUEST_USER from ENV if it exists
  if (process.env.GUEST_USER) {
    users.push({
      email: process.env.GUEST_USER,
      password: process.env.GUEST_PASSWORD,
      name: "Guest User",
      createdAt: new Date().toISOString(),
      isGuest: true // Useful flag for UI/Permissions
    });
  }

  return users;
}

function saveUsers(users) {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

export function findUser(email) {
  return loadUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
}

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
  const users = loadUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error(`User ${email} already exists`);
  }

  const user = {
    email: email.toLowerCase(),
    password: await hashPassword(password),
    name: name || email.split('@')[0],
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  saveUsers(users);
  return { email: user.email, name: user.name };
}

export function removeUser(email) {
  const users = loadUsers();
  const filtered = users.filter(u => u.email.toLowerCase() !== email.toLowerCase());
  if (filtered.length === users.length) throw new Error(`User ${email} not found`);
  saveUsers(filtered);
}

export function listUsers() {
  return loadUsers().map(({ email, name, createdAt }) => ({ email, name, createdAt }));
}

// ── Login ─────────────────────────────────────────────────────
export async function loginUser(email, password) {
  const user = findUser(email);
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
  // Skip auth in local dev if AUTH_ENABLED=false
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
