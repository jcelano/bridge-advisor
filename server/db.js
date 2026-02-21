import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

console.log('DATABASE_URL:', process.env.DATABASE_URL);
// ── Connection ────────────────────────────────────────────────
// Supports either DATABASE_URL (Supabase/Render/Heroku style)
// or individual PG* env vars.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase')
    ? { rejectUnauthorized: false }
    : (process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false),
  max: 5,                   // max connections (plenty for 2-5 users)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// ── Query helper ──────────────────────────────────────────────
export async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

export async function getOne(text, params) {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
}

export async function getAll(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

// ── Schema ────────────────────────────────────────────────────
const SCHEMA_SQL = `
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password      TEXT NOT NULL,
    name          TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS history (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email    TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    advice_type   TEXT NOT NULL DEFAULT 'unknown',
    contract      TEXT DEFAULT '',
    dealer        TEXT DEFAULT '',
    vulnerability TEXT DEFAULT '',
    my_seat       TEXT DEFAULT '',
    declarer      TEXT DEFAULT '',
    hand_summary  TEXT DEFAULT '',
    pbn           TEXT DEFAULT '',
    response      TEXT NOT NULL,
    model         TEXT DEFAULT '',
    usage_input   INTEGER DEFAULT 0,
    usage_output  INTEGER DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_history_user_email ON history(user_email);
  CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC);

  ALTER TABLE history ADD COLUMN IF NOT EXISTS pbn TEXT;
`;

export async function initSchema() {
  try {
    await pool.query(SCHEMA_SQL);
    console.log('✓ Database schema initialized');
  } catch (err) {
    console.error('✗ Failed to initialize schema:', err.message);
    throw err;
  }
}

// ── Graceful shutdown ─────────────────────────────────────────
export async function closePool() {
  await pool.end();
}

// ── Run directly to init schema: npm run db:init ──────────────
const isMain = process.argv[1]?.endsWith('db.js');
if (isMain) {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set. Add it to your .env file.');
    console.error('   Example: DATABASE_URL=postgresql://user:pass@host:5432/dbname');
    process.exit(1);
  }
  try {
    await initSchema();
    const { rows } = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    console.log('Tables:', rows.map(r => r.tablename).join(', '));
  } catch (err) {
    console.error(err.message);
  }
  await pool.end();
}
