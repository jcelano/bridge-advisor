import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Stripe from 'stripe';
import { Resend } from 'resend';
import {
  requireAuth, requireAdmin, loginUser, verifyToken,
  createUser, findUser, redeemInviteCode, markInviteUsed,
  createInviteCode, listInviteCodes, approveUser, getPendingUsers, listUsers,
  generateResetToken, verifyResetToken, resetPassword,
  generateVerificationToken, verifyEmailToken,
} from './auth.js';
import { addEntry, getEntries, getEntry, deleteEntry, clearHistory, createShareToken, revokeShareToken, getSharedEntry } from './history.js';
import { initSchema, getOne, getAll, query as dbQuery } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Simple structured logger ─────────────────────────────────
const log = {
  _fmt(level, ctx, msg) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [${level}] [${ctx}] ${msg}`);
  },
  info(ctx, msg)  { this._fmt('INFO', ctx, msg); },
  warn(ctx, msg)  { this._fmt('WARN', ctx, msg); },
  error(ctx, msg) { this._fmt('ERROR', ctx, msg); },
};

const app = express();
const PORT = process.env.PORT || 3001;
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false'; // enabled by default

// ── Validate API key ──────────────────────────────────────────
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('\n❌  ANTHROPIC_API_KEY not found!\n');
  console.error('   1. Copy .env.example to .env');
  console.error('   2. Add your API key from https://console.anthropic.com/settings/keys');
  console.error('   3. Restart the server\n');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('\n❌  DATABASE_URL not found!\n');
  console.error('   Add your Postgres connection string to .env');
  console.error('   Example: DATABASE_URL=postgresql://user:pass@host:5432/dbname\n');
  process.exit(1);
}

if (AUTH_ENABLED && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'bridge-advisor-dev-secret-change-me')) {
  console.warn('\n⚠️  JWT_SECRET not set or using default. Set a strong secret in .env for production.\n');
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Cloudflare Turnstile verification ────────────────────────
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY;
const TURNSTILE_ENABLED = AUTH_ENABLED && !!TURNSTILE_SECRET;

async function verifyTurnstile(token) {
  if (!TURNSTILE_ENABLED) return true; // skip in dev or when not configured
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(TURNSTILE_SECRET)}&response=${encodeURIComponent(token)}`,
    });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    log.error('turnstile', err.message);
    return false;
  }
}

// ── Stripe ───────────────────────────────────────────────────
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// ── Email (Resend) ───────────────────────────────────────────
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const APP_URL = process.env.APP_URL || 'http://localhost:5174';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || null;
const EMAIL_FROM = process.env.EMAIL_FROM || 'The Stayman Whisperer <onboarding@resend.dev>';

async function sendEmail(to, subject, html) {
  if (!resend) {
    log.warn('email', `Resend not configured. Would send to ${to}: ${subject}`);
    return false;
  }
  try {
    await resend.emails.send({ from: EMAIL_FROM, to, subject, html });
    log.info('email', `Sent "${subject}" to ${to}`);
    return true;
  } catch (err) {
    log.error('email', `Failed to send to ${to}: ${err.message}`);
    return false;
  }
}

// ── Middleware ─────────────────────────────────────────────────

// CORS — restrict origins in production
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3001'];

app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (curl, mobile apps, same-origin)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
}));

// Stripe webhooks need raw body — must come BEFORE express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50kb' }));

// HTTPS redirect in production (Render terminates TLS at the proxy)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] === 'http') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// Serve static files in production
const SERVE_DIR = process.env.SERVE_DIR || 'dist-svelte';
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '..', SERVE_DIR)));
}

// ── Auth Routes (public) ──────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, turnstileToken } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!await verifyTurnstile(turnstileToken)) {
      return res.status(403).json({ error: 'Human verification failed. Please try again.' });
    }

    const result = await loginUser(email, password);
    log.info('auth', `Login: ${result.user.name} (${result.user.email})`);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Verify a token is still valid (used by frontend on page load)
app.get('/api/auth/verify', (req, res) => {
  if (!AUTH_ENABLED) {
    return res.json({ valid: true, user: { email: 'dev@local', name: 'Dev Mode' } });
  }

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.json({ valid: false });
  }

  const decoded = verifyToken(header.split(' ')[1]);
  if (!decoded) {
    return res.json({ valid: false });
  }

  res.json({ valid: true, user: { email: decoded.email, name: decoded.name, tier: decoded.tier } });
});

// Auth status — tells the frontend whether auth is required
app.get('/api/auth/status', (req, res) => {
  res.json({
    authEnabled: AUTH_ENABLED,
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null,
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
  });
});

// ── Registration Routes (public) ─────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, inviteCode, turnstileToken } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (!await verifyTurnstile(turnstileToken)) {
      return res.status(403).json({ error: 'Human verification failed. Please try again.' });
    }

    let approved = false;
    let tier = 'free';
    let dailyLimit = parseInt(process.env.FREE_DAILY_LIMIT) || 5;

    // If invite code provided, validate and apply
    if (inviteCode) {
      const invite = await redeemInviteCode(inviteCode);
      if (!invite) {
        return res.status(400).json({ error: 'Invalid or expired invite code' });
      }
      approved = true;
      tier = invite.tier;
      dailyLimit = tier === 'pro' ? 50 : (parseInt(process.env.FREE_DAILY_LIMIT) || 5);
    }

    const user = await createUser(email, password, name, { approved, tier, dailyLimit });

    if (inviteCode) {
      await markInviteUsed(inviteCode, user.email);
    }

    // Send verification email for ALL new users
    const verifyToken = await generateVerificationToken(user.email);
    if (verifyToken) {
      const verifyUrl = `${APP_URL}?verify=${verifyToken}`;
      log.info('auth', `Verification link for ${user.email}: ${verifyUrl}`);
      await sendEmail(user.email, 'Verify your email — The Stayman Whisperer', `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0c1219; color: #c0d0e0; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="font-size: 36px; color: #d4af37;">♠</span>
            <h2 style="color: #d4af37; margin: 8px 0 0;">Verify Your Email</h2>
          </div>
          <p>Welcome to The Stayman Whisperer! Please verify your email address to ${approved ? 'start using your account' : 'complete your access request'}:</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${verifyUrl}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #d4af37, #a08520); color: #0a0a10; text-decoration: none; font-weight: 700; border-radius: 8px;">Verify Email</a>
          </p>
          <p style="font-size: 12px; color: #6a8a6a;">This link expires in 24 hours.</p>
        </div>
      `);
    }

    if (approved) {
      log.info('auth', `Registered via invite: ${user.name} (${user.email}) — needs email verification`);
      return res.json({ message: 'Account created! Please check your email to verify your address before signing in.' });
    }

    log.info('auth', `Access request: ${user.name} (${user.email})`);

    // Notify admin of new access request
    if (ADMIN_EMAIL) {
      sendEmail(ADMIN_EMAIL, `New access request — ${user.name}`, `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0c1219; color: #c0d0e0; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="font-size: 36px; color: #d4af37;">♠</span>
            <h2 style="color: #d4af37; margin: 8px 0 0;">New Access Request</h2>
          </div>
          <p><strong>${user.name}</strong> (${user.email}) has requested access to The Stayman Whisperer.</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${APP_URL}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #d4af37, #a08520); color: #0a0a10; text-decoration: none; font-weight: 700; border-radius: 8px;">Review in Admin Dashboard</a>
          </p>
        </div>
      `);
    }

    res.json({ message: 'Account created. Your access request is pending approval.' });
  } catch (err) {
    if (err.message.includes('already exists')) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── Email Verification Routes (public) ────────────────────────

app.get('/api/auth/verify-email/:token', async (req, res) => {
  try {
    const user = await verifyEmailToken(req.params.token);
    if (!user) {
      return res.redirect(`${APP_URL}?verify_error=invalid`);
    }
    log.info('auth', `Email verified: ${user.email}`);
    res.redirect(`${APP_URL}?verified=true`);
  } catch (err) {
    log.error('auth', `Verify email error: ${err.message}`);
    res.redirect(`${APP_URL}?verify_error=error`);
  }
});

app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { email, turnstileToken } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    if (!await verifyTurnstile(turnstileToken)) {
      return res.status(403).json({ error: 'Human verification failed. Please try again.' });
    }

    const user = await findUser(email);
    if (user && !user.email_verified) {
      const token = await generateVerificationToken(email);
      if (token) {
        const verifyUrl = `${APP_URL}?verify=${token}`;
        log.info('auth', `Resend verification for ${email}: ${verifyUrl}`);
        await sendEmail(email, 'Verify your email — The Stayman Whisperer', `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0c1219; color: #c0d0e0; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 20px;">
              <span style="font-size: 36px; color: #d4af37;">♠</span>
              <h2 style="color: #d4af37; margin: 8px 0 0;">Verify Your Email</h2>
            </div>
            <p>Click below to verify your email address:</p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="${verifyUrl}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #d4af37, #a08520); color: #0a0a10; text-decoration: none; font-weight: 700; border-radius: 8px;">Verify Email</a>
            </p>
            <p style="font-size: 12px; color: #6a8a6a;">This link expires in 24 hours.</p>
          </div>
        `);
      }
    }

    // Always return success — don't leak whether email exists
    res.json({ message: 'If an account with that email exists and is unverified, a new verification link has been sent.' });
  } catch (err) {
    log.error('auth', `Resend verification error: ${err.message}`);
    res.json({ message: 'If an account with that email exists and is unverified, a new verification link has been sent.' });
  }
});

// ── Password Reset Routes (public) ────────────────────────────

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email, turnstileToken } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    if (!await verifyTurnstile(turnstileToken)) {
      return res.status(403).json({ error: 'Human verification failed. Please try again.' });
    }

    const rawToken = await generateResetToken(email);

    // Always return success — don't leak whether email exists
    if (rawToken) {
      const resetUrl = `${APP_URL}?reset=${rawToken}`;
      log.info('auth', `Password reset requested for ${email}`);
      log.info('auth', `Reset link: ${resetUrl}`);

      await sendEmail(email, 'Reset your password — The Stayman Whisperer', `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0c1219; color: #c0d0e0; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="font-size: 36px; color: #d4af37;">♠</span>
            <h2 style="color: #d4af37; margin: 8px 0 0;">The Stayman Whisperer</h2>
          </div>
          <p>You requested a password reset. Click the link below to set a new password:</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #d4af37, #a08520); color: #0a0a10; text-decoration: none; font-weight: 700; border-radius: 8px;">Reset Password</a>
          </p>
          <p style="font-size: 12px; color: #6a8a6a;">This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `);
    }

    res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (err) {
    log.error('auth', `Forgot password error: ${err.message}`);
    res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password, turnstileToken } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (!await verifyTurnstile(turnstileToken)) {
      return res.status(403).json({ error: 'Human verification failed. Please try again.' });
    }

    const user = await verifyResetToken(token);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    await resetPassword(user.email, password);
    log.info('auth', `Password reset completed for ${user.email}`);

    res.json({ message: 'Password has been reset. You can now sign in with your new password.' });
  } catch (err) {
    log.error('auth', `Reset password error: ${err.message}`);
    res.status(500).json({ error: 'Failed to reset password. Please try again.' });
  }
});

// ── Admin Routes ──────────────────────────────────────────────

app.get('/api/admin/pending', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await getPendingUsers();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/approve/:email', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { tier, dailyLimit } = req.body;
    await approveUser(req.params.email, { tier, dailyLimit });
    log.info('admin', `Approved: ${req.params.email} (tier: ${tier || 'free'})`);

    // Notify the user that their access has been granted
    sendEmail(req.params.email, 'Your access has been approved — The Stayman Whisperer', `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0c1219; color: #c0d0e0; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <span style="font-size: 36px; color: #d4af37;">♠</span>
          <h2 style="color: #d4af37; margin: 8px 0 0;">You're In!</h2>
        </div>
        <p>Great news — your access request for The Stayman Whisperer has been approved!</p>
        <p>You can now sign in and start getting AI-powered bridge analysis.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${APP_URL}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #d4af37, #a08520); color: #0a0a10; text-decoration: none; font-weight: 700; border-radius: 8px;">Sign In Now</a>
        </p>
      </div>
    `);

    res.json({ approved: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/invite-codes', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { tier, uses, expiresInDays } = req.body;
    const code = await createInviteCode(req.user.email, { tier, uses, expiresInDays });
    res.json(code);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/invite-codes', requireAuth, requireAdmin, async (req, res) => {
  try {
    const codes = await listInviteCodes();
    res.json({ codes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const offset = parseInt(req.query.offset) || 0;
    const search = (req.query.search || '').trim();
    const result = await listUsers({ limit, offset, search });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/usage', requireAuth, requireAdmin, async (req, res) => {
  try {
    const today = await getOne(
      `SELECT COALESCE(SUM(query_count), 0) as total_queries,
              COALESCE(SUM(tokens_used), 0) as total_tokens,
              COUNT(DISTINCT user_email) as active_users
       FROM daily_usage WHERE usage_date = CURRENT_DATE`
    );
    const topUsers = await getAll(
      `SELECT user_email, query_count, tokens_used
       FROM daily_usage WHERE usage_date = CURRENT_DATE
       ORDER BY query_count DESC LIMIT 10`
    );
    res.json({ today, topUsers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Rate Limiting ─────────────────────────────────────────────

async function checkRateLimit(req, res, next) {
  if (process.env.AUTH_ENABLED === 'false') return next();

  const email = req.user?.email;
  if (!email) return res.status(401).json({ error: 'Not authenticated' });

  try {
    // Get user's daily limit from database (JWT tier may be stale)
    const user = await findUser(email);
    const dailyLimit = user?.daily_limit || parseInt(process.env.FREE_DAILY_LIMIT) || 5;

    // Upsert today's usage row and get current count
    const usage = await getOne(
      `INSERT INTO daily_usage (user_email, usage_date, query_count)
       VALUES ($1, CURRENT_DATE, 0)
       ON CONFLICT (user_email, usage_date) DO NOTHING
       RETURNING query_count`,
      [email]
    );
    // If INSERT returned nothing, row already exists — fetch it
    const current = usage || await getOne(
      `SELECT query_count FROM daily_usage WHERE user_email = $1 AND usage_date = CURRENT_DATE`,
      [email]
    );

    const used = current?.query_count || 0;
    if (used >= dailyLimit) {
      return res.status(429).json({
        error: 'Daily analysis limit reached',
        limit: dailyLimit,
        used,
        tier: user?.tier || 'free',
        resetsAt: 'midnight UTC',
      });
    }

    // Attach usage info for post-response increment
    req.dailyUsage = { email, used, limit: dailyLimit };
    next();
  } catch (err) {
    log.error('rate-limit', err.message);
    next(); // Don't block on rate limit errors
  }
}

async function incrementUsage(email, inputTokens, outputTokens) {
  try {
    await dbQuery(
      `UPDATE daily_usage
       SET query_count = query_count + 1,
           tokens_used = tokens_used + $2
       WHERE user_email = $1 AND usage_date = CURRENT_DATE`,
      [email, (inputTokens || 0) + (outputTokens || 0)]
    );
  } catch (err) {
    log.warn('usage', `Failed to increment: ${err.message}`);
  }
}

// ── Usage endpoint (authenticated) ────────────────────────────

app.get('/api/usage', requireAuth, async (req, res) => {
  const email = req.user?.email;
  if (!email) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const user = await findUser(email);
    const usage = await getOne(
      `SELECT query_count, tokens_used FROM daily_usage
       WHERE user_email = $1 AND usage_date = CURRENT_DATE`,
      [email]
    );

    res.json({
      tier: user?.tier || 'free',
      dailyLimit: user?.daily_limit || parseInt(process.env.FREE_DAILY_LIMIT) || 5,
      usedToday: usage?.query_count || 0,
      remainingToday: Math.max(0, (user?.daily_limit || parseInt(process.env.FREE_DAILY_LIMIT) || 5) - (usage?.query_count || 0)),
      tokensToday: usage?.tokens_used || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Protected Routes ──────────────────────────────────────────

app.post('/api/advice', requireAuth, checkRateLimit, async (req, res) => {
  try {
    const { prompt, maxTokens = 1500, handContext } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'No prompt provided' });
    }

    const userName = req.user?.name || 'anonymous';
    const userEmail = req.user?.email || 'anonymous';
    log.info('advice', `Query from ${userName} (${prompt.length} chars)`);

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: `You are a world-class bridge player and teacher with decades of tournament experience.

Rules for your response:
- The "requesting player's seat" field tells you whose perspective to take. Always refer to them by their seat name (e.g. "As South, you should...").
- Use proper bridge terminology throughout.
- When analyzing bidding, reference the stated convention system (SAYC or 2/1 Game Forcing).
- Be specific: name exact cards (e.g. "the jack of diamonds"), reference trick numbers, and cite probabilities where relevant.
- Consider vulnerability and scoring implications.
- Format with short paragraphs and markdown headers. Never write walls of text.
- When a "Grades" section is requested, always include it at the end with letter grades A–F.
- Write with authority and confidence. Never second-guess yourself, re-read the data, or show uncertainty about what the cards or play record say. Statements like "wait —", "let me re-read", "actually, re-examining", or "I mis-stated" are forbidden. Parse the data silently, then state your conclusions directly.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n')
      .replace(/[\n\r]+#{1,6}\s*$/m, '')  // strip trailing stray heading (e.g. "##" at end)
      .trimEnd();

    log.info('advice', `Response: ${text.slice(0, 80)}...`);

    // Auto-save to history
    let historyId = null;
    try {
      const entry = await addEntry(userEmail, {
        adviceType: handContext?.adviceType || 'unknown',
        contract: handContext?.contract || '',
        dealer: handContext?.dealer || '',
        vulnerability: handContext?.vulnerability || '',
        mySeat: handContext?.mySeat || '',
        declarer: handContext?.declarer || '',
        handSummary: handContext?.handSummary || '',
        pbn: handContext?.pbn || '',
        response: text,
        model: message.model,
        usage: message.usage,
      });
      historyId = entry.id;
    } catch (e) {
      log.warn('history', `Failed to save: ${e.message}`);
    }

    // Increment daily usage counter
    await incrementUsage(userEmail, message.usage?.input_tokens, message.usage?.output_tokens);

    res.json({
      text,
      model: message.model,
      usage: message.usage,
      historyId,
    });
  } catch (error) {
    log.error('advice', error.message);

    if (error.status === 401) {
      return res.status(401).json({ error: 'Invalid Anthropic API key. Check your .env file.' });
    }
    if (error.status === 429) {
      return res.status(429).json({ error: 'Rate limited. Wait a moment and try again.' });
    }
    if (error.status === 529) {
      return res.status(529).json({ error: 'Anthropic API is overloaded. Try again shortly.' });
    }

    res.status(500).json({ error: error.message || 'Unknown server error' });
  }
});

// ── History Routes ─────────────────────────────────────────────

// List history entries
app.get('/api/history', requireAuth, (req, res) => {
  const email = req.user?.email;
  if (!email) return res.status(401).json({ error: 'Not authenticated' });

  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;
  const adviceType = req.query.type || undefined;
  const scope = req.query.scope === 'all' ? 'all' : 'user';

  getEntries(email, { limit, offset, adviceType, scope })
    .then(result => res.json(result))
    .catch(err => res.status(500).json({ error: err.message || 'Failed to load history' }));
});

// Get a single history entry
app.get('/api/history/:id', requireAuth, (req, res) => {
  const email = req.user?.email;
  if (!email) return res.status(401).json({ error: 'Not authenticated' });

  getEntry(email, req.params.id)
    .then(entry => {
      if (!entry) return res.status(404).json({ error: 'Entry not found' });
      res.json(entry);
    })
    .catch(err => res.status(500).json({ error: err.message || 'Failed to load entry' }));
});

// Delete a single history entry
app.delete('/api/history/:id', requireAuth, (req, res) => {
  const email = req.user?.email;
  if (!email) return res.status(401).json({ error: 'Not authenticated' });

  deleteEntry(email, req.params.id)
    .then(deleted => res.json({ deleted }))
    .catch(err => res.status(500).json({ error: err.message || 'Failed to delete entry' }));
});

// Clear all history
app.delete('/api/history', requireAuth, (req, res) => {
  const email = req.user?.email;
  if (!email) return res.status(401).json({ error: 'Not authenticated' });

  clearHistory(email)
    .then(() => res.json({ cleared: true }))
    .catch(err => res.status(500).json({ error: err.message || 'Failed to clear history' }));
});

// ── Share Routes ───────────────────────────────────────────────

// Generate (or return existing) share token for an entry — auth required
app.post('/api/history/:id/share', requireAuth, async (req, res) => {
  const email = req.user?.email;
  if (!email) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const token = await createShareToken(email, req.params.id);
    if (!token) return res.status(404).json({ error: 'Entry not found' });
    res.json({ token, url: `/share/${token}` });
  } catch (err) {
    log.error('share', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Revoke a share token — auth required
app.delete('/api/history/:id/share', requireAuth, async (req, res) => {
  const email = req.user?.email;
  if (!email) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const ok = await revokeShareToken(email, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Entry not found' });
    res.json({ revoked: true });
  } catch (err) {
    log.error('share', `Revoke: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Fetch a shared entry by token — fully public
app.get('/api/share/:token', async (req, res) => {
  try {
    const entry = await getSharedEntry(req.params.token);
    if (!entry) return res.status(404).json({ error: 'Shared entry not found' });
    res.json(entry);
  } catch (err) {
    log.error('share', `Lookup: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Stripe Routes ─────────────────────────────────────────────

app.post('/api/stripe/checkout', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments not configured' });

  const email = req.user?.email;
  if (!email) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const user = await findUser(email);

    // Create or reuse Stripe customer
    let customerId = user?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email, name: user?.name || '' });
      customerId = customer.id;
      await dbQuery('UPDATE users SET stripe_customer_id = $1 WHERE LOWER(email) = LOWER($2)', [customerId, email]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${APP_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}`,
      metadata: { user_email: email },
    });

    res.json({ url: session.url });
  } catch (err) {
    log.error('stripe', `Checkout error: ${err.message}`);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

app.post('/api/stripe/portal', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments not configured' });

  const email = req.user?.email;
  const user = await findUser(email);
  if (!user?.stripe_customer_id) {
    return res.status(400).json({ error: 'No active subscription found' });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: APP_URL,
    });
    res.json({ url: session.url });
  } catch (err) {
    log.error('stripe', `Portal error: ${err.message}`);
    res.status(500).json({ error: 'Failed to open billing portal' });
  }
});

app.post('/api/stripe/webhook', async (req, res) => {
  if (!stripe) return res.status(503).send('Not configured');

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = webhookSecret
      ? stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
      : JSON.parse(req.body);
  } catch (err) {
    log.error('stripe', `Webhook signature error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const email = session.metadata?.user_email || session.customer_email;
        if (email && session.subscription) {
          await dbQuery(
            `UPDATE users SET tier = 'pro', daily_limit = 50, stripe_subscription_id = $1, subscription_status = 'active' WHERE LOWER(email) = LOWER($2)`,
            [session.subscription, email]
          );
          log.info('stripe', `Pro activated for ${email}`);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await dbQuery(
          `UPDATE users SET tier = 'free', daily_limit = ${parseInt(process.env.FREE_DAILY_LIMIT) || 5}, subscription_status = 'canceled' WHERE stripe_subscription_id = $1`,
          [sub.id]
        );
        log.info('stripe', `Subscription canceled: ${sub.id}`);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        await dbQuery(
          `UPDATE users SET subscription_status = $1 WHERE stripe_subscription_id = $2`,
          [sub.status, sub.id]
        );
        log.info('stripe', `Subscription updated: ${sub.id} → ${sub.status}`);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          await dbQuery(
            `UPDATE users SET subscription_status = 'past_due' WHERE stripe_subscription_id = $1`,
            [invoice.subscription]
          );
          log.warn('stripe', `Payment failed for subscription: ${invoice.subscription}`);
        }
        break;
      }
    }
  } catch (err) {
    log.error('stripe', `Webhook handler error: ${err.message}`);
  }

  res.json({ received: true });
});

// ── Feedback Routes ───────────────────────────────────────────

app.post('/api/feedback', async (req, res) => {
  try {
    const { category, message, browserInfo, pageUrl, turnstileToken, email } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message must be under 2000 characters' });
    }

    if (!await verifyTurnstile(turnstileToken)) {
      return res.status(403).json({ error: 'Human verification failed. Please try again.' });
    }

    // Try to get user email from auth token if present
    let userEmail = email || null;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const decoded = verifyToken(header.split(' ')[1]);
      if (decoded?.email) userEmail = decoded.email;
    }

    await dbQuery(
      `INSERT INTO feedback (user_email, category, message, browser_info, page_url)
       VALUES ($1, $2, $3, $4, $5)`,
      [userEmail, category || 'general', message.trim(), browserInfo ? JSON.stringify(browserInfo) : null, pageUrl || null]
    );

    log.info('feedback', `New ${category || 'general'} from ${userEmail || 'anonymous'}`);
    res.json({ success: true });
  } catch (err) {
    log.error('feedback', err.message);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

app.get('/api/admin/feedback', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    const entries = await getAll(
      `SELECT id, user_email, category, message, browser_info, page_url, created_at
       FROM feedback ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const total = await getOne('SELECT COUNT(*) as count FROM feedback');
    res.json({ entries, total: parseInt(total?.count || 0) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health check (public) ─────────────────────────────────────
app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try {
    await dbQuery('SELECT 1');
    dbOk = true;
  } catch (_) {}

  const status = dbOk ? 'ok' : 'degraded';
  res.status(dbOk ? 200 : 503).json({
    status,
    db: dbOk,
    model: MODEL,
    authEnabled: AUTH_ENABLED,
  });
});

// ── Global error handler ─────────────────────────────────────
app.use((err, req, res, _next) => {
  log.error('server', `Unhandled: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Catch-all for production SPA routing ──────────────────────
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '..', SERVE_DIR, 'index.html'));
  });
}

// ── Start ─────────────────────────────────────────────────────
(async () => {
  try {
    await initSchema();
  } catch (err) {
    console.error('Failed to connect to database:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`\n♠  The Stayman Whisperer Server`);
    console.log(`────────────────────────────`);
    console.log(`   Server:  http://localhost:${PORT}`);
    console.log(`   Model:   ${MODEL}`);
    console.log(`   Auth:    ${AUTH_ENABLED ? 'ENABLED' : 'DISABLED (dev mode)'}`);
    console.log(`   DB:      connected`);
    console.log(`   Mode:    ${process.env.NODE_ENV || 'development'}`);
    console.log(`────────────────────────────\n`);
  });
})();
