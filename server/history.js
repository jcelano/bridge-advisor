import { randomBytes } from 'crypto';
import { query, getOne, getAll } from './db.js';

function makeShareToken() {
  return randomBytes(9).toString('base64url'); // URL-safe, no +/=/
}

/**
 * Add a history entry.
 */
export async function addEntry(email, entry) {
  const row = await getOne(
    `INSERT INTO history
      (user_email, advice_type, contract, dealer, vulnerability, my_seat, declarer, hand_summary, pbn, response, model, usage_input, usage_output)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id, created_at as timestamp`,
    [
      email.toLowerCase(),
      entry.adviceType || 'unknown',
      entry.contract || '',
      entry.dealer || '',
      entry.vulnerability || '',
      entry.mySeat || '',
      entry.declarer || '',
      entry.handSummary || '',
      entry.pbn || '',
      entry.response,
      entry.model || '',
      entry.usage?.input_tokens || 0,
      entry.usage?.output_tokens || 0,
    ]
  );
  return row;
}

/**
 * Get history entries for a user with pagination and optional filter.
 */
export async function getEntries(email, { limit = 50, offset = 0, adviceType, scope } = {}) {
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (scope !== 'all') {
    conditions.push('user_email = LOWER($1)');
    params.push(email);
    paramIdx++;
  }

  if (adviceType) {
    conditions.push(`advice_type = $${paramIdx}`);
    params.push(adviceType);
    paramIdx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await getOne(
    `SELECT COUNT(*) as total FROM history ${where}`,
    params
  );

  params.push(limit, offset);
  const entries = await getAll(
    `SELECT
       history.id, history.advice_type as "adviceType", history.contract, history.dealer, history.vulnerability,
       history.my_seat as "mySeat", history.declarer, history.hand_summary as "handSummary",
       history.pbn, history.response, history.model,
       history.usage_input as "usageInput", history.usage_output as "usageOutput",
       history.created_at as timestamp,
       history.user_email as "userEmail",
       users.name as "userName"
     FROM history
     LEFT JOIN users ON users.email = history.user_email
     ${where}
     ORDER BY history.created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    params
  );

  const total = parseInt(countResult.total);
  return {
    entries,
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * Get a single entry by ID (scoped to user).
 */
export async function getEntry(email, id) {
  return getOne(
    `SELECT
       id, advice_type as "adviceType", contract, dealer, vulnerability,
       my_seat as "mySeat", declarer, hand_summary as "handSummary",
       pbn, response, model,
       usage_input as "usageInput", usage_output as "usageOutput",
       created_at as timestamp
     FROM history
     WHERE id = $1 AND user_email = LOWER($2)`,
    [id, email]
  );
}

/**
 * Generate (or return existing) share token for an entry.
 * Scoped to user so you can't share someone else's entry.
 */
export async function createShareToken(email, id) {
  // First check if a valid token already exists
  const existing = await getOne(
    `SELECT share_token FROM history WHERE id = $1 AND user_email = LOWER($2)`,
    [id, email]
  );
  if (!existing) return null; // entry not found or not owned by user

  // Return existing token if it's already URL-safe
  if (existing.share_token && /^[A-Za-z0-9_-]+$/.test(existing.share_token)) {
    return existing.share_token;
  }

  // Generate a fresh URL-safe token in Node (works with any Postgres version)
  const token = makeShareToken();
  await query(
    `UPDATE history SET share_token = $1 WHERE id = $2 AND user_email = LOWER($3)`,
    [token, id, email]
  );
  return token;
}

/**
 * Get a single entry by its public share token (no auth required).
 */
export async function getSharedEntry(token) {
  return getOne(
    `SELECT
       history.id, history.advice_type as "adviceType", history.contract, history.dealer, history.vulnerability,
       history.my_seat as "mySeat", history.declarer, history.hand_summary as "handSummary",
       history.pbn, history.response, history.model, history.created_at as timestamp,
       users.name as "userName"
     FROM history
     LEFT JOIN users ON users.email = history.user_email
     WHERE history.share_token = $1`,
    [token]
  );
}

/**
 * Delete a single entry (scoped to user).
 */
export async function deleteEntry(email, id) {
  const result = await query(
    'DELETE FROM history WHERE id = $1 AND user_email = LOWER($2)',
    [id, email]
  );
  return result.rowCount > 0;
}

/**
 * Clear all history for a user.
 */
export async function clearHistory(email) {
  await query('DELETE FROM history WHERE user_email = LOWER($1)', [email]);
}
