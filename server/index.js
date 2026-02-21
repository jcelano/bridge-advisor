import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { requireAuth, loginUser, verifyToken } from './auth.js';
import { addEntry, getEntries, getEntry, deleteEntry, clearHistory } from './history.js';
import { initSchema } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// ── Middleware ─────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve static files in production
const SERVE_DIR = process.env.SERVE_DIR || 'dist-svelte';
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '..', SERVE_DIR)));
}

// ── Auth Routes (public) ──────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await loginUser(email, password);
    console.log(`♠ Login: ${result.user.name} (${result.user.email})`);
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

  res.json({ valid: true, user: { email: decoded.email, name: decoded.name } });
});

// Auth status — tells the frontend whether auth is required
app.get('/api/auth/status', (req, res) => {
  res.json({ authEnabled: AUTH_ENABLED });
});

// ── Protected Routes ──────────────────────────────────────────

app.post('/api/advice', requireAuth, async (req, res) => {
  try {
    const { prompt, maxTokens = 1500, handContext } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'No prompt provided' });
    }

    const userName = req.user?.name || 'anonymous';
    const userEmail = req.user?.email || 'anonymous';
    console.log(`\n♠ Query from ${userName} (${prompt.length} chars)`);

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: `You are a world-class bridge player and teacher with decades of tournament experience. 
Give clear, practical advice with step-by-step reasoning. 
Use proper bridge terminology. 
When discussing bidding, reference the relevant convention system (SAYC or 2/1 Game Forcing). 
Be specific about card combinations, probabilities, and expected tricks when relevant.
Consider vulnerability and scoring implications in your analysis.
Format your response clearly. Use short paragraphs, not walls of text.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n');

    console.log(`♠ Response: ${text.slice(0, 80)}...`);

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
      console.warn('Failed to save history:', e.message);
    }

    res.json({
      text,
      model: message.model,
      usage: message.usage,
      historyId,
    });
  } catch (error) {
    console.error('API Error:', error.message);

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

// ── Health check (public) ─────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: MODEL, authEnabled: AUTH_ENABLED });
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
