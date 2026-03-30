# App Guidelines

Reusable architecture patterns and stack choices for building freemium web applications, extracted from a production app (The Stayman Whisperer).

---

## Tech Stack (All Free/Low-Cost Tiers)

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | SvelteKit 2 + Svelte 5 | Fast, reactive, tiny bundles, scoped CSS built-in |
| **Backend** | Express.js (Node, ES Modules) | Simple, mature, pairs well with SvelteKit static build |
| **Database** | PostgreSQL via Supabase (free 500MB) | Reliable, free hosted tier, no vendor lock-in |
| **AI** | Anthropic Claude SDK | Best-in-class reasoning; swap model via env var |
| **Auth** | JWT + bcryptjs | Zero cost, no third-party dependency |
| **Payments** | Stripe (subscriptions) | Industry standard, generous test mode |
| **Email** | Resend (free: 100/day) | Simple API, falls back to console in dev |
| **Bot Protection** | Cloudflare Turnstile | Free CAPTCHA alternative, optional |
| **Hosting** | Render.com or Vercel | Free tiers, one-click deploy via blueprint |
| **CI/CD** | GitHub Actions | Free for public repos, generous minutes for private |

**Total monthly cost to run**: ~$0 until you outgrow free tiers (then ~$7-15/mo for Render Starter + Supabase Pro).

---

## Project Structure

```
my-app/
├── server/                     # Express backend
│   ├── index.js                # Main server: routes, middleware, static serving
│   ├── auth.js                 # Auth logic: register, login, verify, reset
│   ├── db.js                   # Database pool, schema init, queries
│   └── manage-users.js         # CLI tool for user management
├── svelte-app/                 # SvelteKit frontend (static adapter)
│   ├── src/
│   │   ├── routes/             # SvelteKit file-based routing
│   │   │   ├── +layout.svelte  # Global layout (nav, auth state, modals)
│   │   │   ├── +page.svelte    # Main app page
│   │   │   ├── terms/          # Terms of Service
│   │   │   └── privacy/        # Privacy Policy
│   │   ├── lib/
│   │   │   ├── api.js          # Frontend API client (fetch wrapper)
│   │   │   ├── components/     # Reusable Svelte components
│   │   │   └── [domain]/       # Domain-specific logic & constants
│   │   └── app.css             # Global styles & CSS variables
│   └── svelte.config.js        # Static adapter config
├── shared/                     # Code shared between server & frontend
├── .github/workflows/ci.yml    # CI pipeline
├── .env.example                # Documented env var template
├── render.yaml                 # Render.com deploy blueprint
├── vercel.json                 # Vercel deploy config
└── package.json                # Root: server deps + orchestration scripts
```

**Key principles:**
- Frontend builds to static files (`dist-svelte/`), served by Express in production
- In development, run frontend dev server + Express concurrently
- Domain logic lives in `lib/[domain]/` with its own tests
- One `package.json` at root for server deps, one in `svelte-app/` for frontend deps

---

## Authentication System

### Registration Flow
1. User submits email + password (8+ char minimum)
2. Optionally provide an **invite code** for instant access
3. Hash password with bcryptjs (12 rounds)
4. Generate email verification token (SHA-256 hashed before storage, 24h expiry)
5. Send verification email via Resend
6. Without invite code: account is created but requires admin approval

### Login Flow
1. Verify email + password (bcrypt compare)
2. Require both `email_verified = true` AND `approved = true`
3. Issue JWT token (HS256, 7-day expiry) containing `{ email, name, tier }`
4. Frontend stores token, sends as `Authorization: Bearer <token>`

### Password Reset
- 15-minute expiry tokens, hashed before DB storage
- Turnstile bot check on form submission

### Middleware
```javascript
requireAuth    // Validates JWT from Authorization header, sets req.user
requireAdmin   // Checks req.user.tier === 'admin'
```

### Dev Mode
Set `AUTH_ENABLED=false` to bypass all auth (local development only).

---

## Freemium Business Model

### Tiers
| Tier | Price | Daily Limit | How to Get |
|------|-------|------------|------------|
| Free | $0 | 5 queries | Invite code or admin approval |
| Pro | $3/mo | 50 queries | Stripe subscription |
| Admin | N/A | Unlimited | Set directly in DB |

### Access Control Mechanisms

**1. Invite Codes**
- Admin-generated, 8-char URL-safe base64
- Configurable: one-time or multi-use, optional expiry
- Auto-approve user and set tier on registration
- Track who used each code

**2. Daily Rate Limiting**
- `daily_usage` table tracks per-user queries per day
- Middleware checks count before allowing AI requests
- Resets at midnight UTC automatically (SQL: `CURRENT_DATE`)
- Returns HTTP 429 with remaining time when exceeded

**3. Stripe Subscription**
- Checkout session creates/reuses Stripe customer
- Webhook handles lifecycle events:
  - `checkout.session.completed` -> upgrade to pro
  - `customer.subscription.deleted` -> downgrade to free
  - `invoice.payment_failed` -> mark as past_due
- Billing portal for self-service management

---

## Database Schema Pattern

Use PostgreSQL with these core tables:

### users
```sql
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,              -- bcrypt hash
    name TEXT DEFAULT '',
    tier TEXT DEFAULT 'free',            -- 'free', 'pro', 'admin'
    daily_limit INTEGER DEFAULT 5,
    approved BOOLEAN DEFAULT false,
    email_verified BOOLEAN DEFAULT false,
    reset_token TEXT UNIQUE,
    reset_token_expires TIMESTAMPTZ,
    verification_token TEXT UNIQUE,
    verification_token_expires TIMESTAMPTZ,
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT,
    subscription_status TEXT DEFAULT 'none',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### daily_usage
```sql
CREATE TABLE IF NOT EXISTS daily_usage (
    id SERIAL PRIMARY KEY,
    user_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    usage_date DATE DEFAULT CURRENT_DATE,
    query_count INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    UNIQUE(user_email, usage_date)
);
```

### invite_codes
```sql
CREATE TABLE IF NOT EXISTS invite_codes (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    created_by TEXT REFERENCES users(email),
    used_by TEXT REFERENCES users(email),
    tier TEXT DEFAULT 'free',
    uses_remaining INTEGER DEFAULT 1,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### feedback
```sql
CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    user_email TEXT,
    category TEXT DEFAULT 'general',
    message TEXT NOT NULL,
    browser_info JSONB,
    page_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Add domain-specific tables as needed (e.g., `history` for storing AI responses).

---

## API Route Structure

Organize routes by concern with consistent patterns:

```
# Auth (public, some with Turnstile)
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/verify-email/:token
POST   /api/auth/resend-verification
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
GET    /api/auth/verify              # Validate current JWT
GET    /api/auth/status              # Auth config (enabled? turnstile?)

# Core feature (protected)
POST   /api/[feature]               # Main AI/feature endpoint
GET    /api/usage                    # User's daily usage stats

# History (protected)
GET    /api/history
GET    /api/history/:id
DELETE /api/history/:id
DELETE /api/history                  # Clear all

# Sharing (mixed)
POST   /api/history/:id/share       # Generate share token (protected)
DELETE /api/history/:id/share       # Revoke share token (protected)
GET    /api/share/:token            # View shared item (public)

# Payments (protected except webhook)
POST   /api/stripe/checkout
POST   /api/stripe/portal
POST   /api/stripe/webhook          # Raw body, Stripe signature verification

# Admin (protected + requireAdmin)
GET    /api/admin/pending
POST   /api/admin/approve/:email
POST   /api/admin/invite-codes
GET    /api/admin/invite-codes
GET    /api/admin/users
GET    /api/admin/usage
GET    /api/admin/feedback

# Feedback (public with Turnstile)
POST   /api/feedback

# Health (public)
GET    /api/health                  # DB + auth status check
```

---

## Admin Dashboard

Every app should include an admin panel with:

- **Pending approvals** -- list users awaiting access, one-click approve
- **User management** -- search, pagination, tier adjustment, activity summary
- **Invite codes** -- generate, set uses/expiry, track usage
- **Usage analytics** -- today's queries, tokens, active users, top users
- **Feedback viewer** -- user-submitted feedback with metadata

Protect all admin routes with `requireAdmin` middleware.

---

## AI Integration Pattern

```javascript
// Server-side: wrap AI calls with rate limiting + history tracking
app.post('/api/advice', requireAuth, checkRateLimit, async (req, res) => {
    const { prompt, maxTokens = 1500 } = req.body;

    const response = await anthropic.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
    });

    // Save to history
    await saveHistory(req.user.email, response, context);

    // Track usage
    await incrementUsage(req.user.email, response.usage);

    res.json({ response: response.content[0].text });
});
```

**Key patterns:**
- System prompt defines AI persona and behavior rules
- Make model configurable via `CLAUDE_MODEL` env var
- Track both input and output tokens for cost monitoring
- Save every response to history for user reference
- Handle API errors gracefully: 401 (bad key), 429 (rate limit), 529 (overloaded)

---

## Email System

Use Resend with graceful fallback:

```javascript
async function sendEmail({ to, subject, html }) {
    if (!process.env.RESEND_API_KEY) {
        console.log(`[Email] Would send to ${to}: ${subject}`);
        return;
    }
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
        from: process.env.EMAIL_FROM || 'App <onboarding@resend.dev>',
        to, subject, html
    });
}
```

**Emails to implement:**
1. Email verification (registration)
2. Admin notification (new user awaiting approval)
3. Account approval confirmation
4. Password reset link

---

## CI/CD Pipeline

### GitHub Actions (`.github/workflows/ci.yml`)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    name: Lint & Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm

      - name: Install server dependencies
        run: npm ci

      - name: Install frontend dependencies
        run: cd svelte-app && npm ci

      - name: Check server syntax
        run: |
          node -c server/index.js
          node -c server/auth.js
          node -c server/db.js

      - name: Svelte check
        run: cd svelte-app && npx svelte-check --threshold error

      - name: Run tests
        run: cd svelte-app && npm test

      - name: Build frontend
        run: cd svelte-app && npm run build

  security:
    name: Security Check
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - name: Check for secrets in code
        run: |
          # Fail if .env is being modified
          if git diff --name-only origin/main...HEAD | grep -q '^\.env$'; then
            echo "::error::.env file modified — check for secrets!"
            exit 1
          fi
          # Check for common secret patterns
          if grep -rn --include='*.js' --include='*.svelte' --include='*.json' \
            -E '(sk-ant-api|sk_live_|sk_test_|re_[A-Za-z0-9]{20,}|whsec_)' \
            --exclude-dir=node_modules --exclude-dir=.svelte-kit .; then
            echo "::error::Possible secrets found in source code!"
            exit 1
          fi
```

**What it covers:**
- Server syntax validation (`node -c`)
- Svelte type checking (`svelte-check`)
- Unit tests (Vitest)
- Frontend build verification (catches import errors)
- Secret detection on PRs (API keys, Stripe keys, etc.)

### Deployment (Render.com)

Render auto-deploys on push to `main` via the blueprint (`render.yaml`):

```yaml
services:
  - type: web
    name: my-app
    runtime: node
    plan: starter
    buildCommand: |
      npm install --include=dev
      cd svelte-app && npm install --include=dev && npx vite build
    startCommand: npm run start:svelte
    envVars:
      - key: JWT_SECRET
        generateValue: true
      - key: NODE_ENV
        value: production
```

**Flow:** Push to main -> GitHub Actions CI passes -> Render detects push -> builds & deploys.

---

## Environment Variables

Create a `.env.example` with every var documented:

```bash
# ── Required ──────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=change-me   # Generate: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# ── Authentication ────────────────────────────────────────
# JWT_EXPIRY=7d
# AUTH_ENABLED=false                    # Disable for local dev

# ── Bot Protection (optional) ────────────────────────────
# TURNSTILE_SITE_KEY=0x4AAAAAAA...
# TURNSTILE_SECRET_KEY=0x4AAAAAAA...

# ── Email (optional, logs to console if unset) ───────────
# RESEND_API_KEY=re_xxxxxxxx
# EMAIL_FROM=App Name <onboarding@resend.dev>
# ADMIN_EMAIL=you@example.com
# APP_URL=https://your-app.onrender.com

# ── Stripe (optional, disables payments if unset) ────────
# STRIPE_SECRET_KEY=sk_test_xxxxx
# STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
# STRIPE_PRICE_ID=price_xxxxx
# STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# ── Deployment ───────────────────────────────────────────
# PORT=3001
# NODE_ENV=production
# SERVE_DIR=dist-svelte
# ALLOWED_ORIGINS=https://your-app.com,http://localhost:5174
# FREE_DAILY_LIMIT=5
# CLAUDE_MODEL=claude-sonnet-4-20250514
```

**Design principle:** Every optional service degrades gracefully. No Resend key? Emails log to console. No Stripe keys? Payment features hidden. No Turnstile? Forms work without bot check.

---

## Cloudflare Turnstile (Bot Protection)

Turnstile is Cloudflare's free CAPTCHA alternative. It protects public-facing forms (login, register, password reset, feedback) from bots without annoying puzzle UIs.

### Setup
1. Create a Turnstile widget at [dash.cloudflare.com](https://dash.cloudflare.com/?to=/:account/turnstile)
2. Set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in `.env`
3. If keys are absent, Turnstile is disabled and forms work without bot checks

### Frontend: Reusable Svelte Component

```svelte
<!-- Turnstile.svelte -->
<script>
  import { onMount, onDestroy } from 'svelte';
  let { siteKey, onverify = () => {}, onexpire = () => {} } = $props();
  let container;
  let widgetId = null;

  onMount(() => {
    if (!siteKey) return;
    function renderWidget() {
      if (!window.turnstile || !container) return;
      widgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        callback: (token) => onverify(token),
        'expired-callback': () => { onverify(''); onexpire(); },
        'error-callback': () => onverify(''),
        theme: 'dark',
        size: 'normal',
      });
    }
    if (window.turnstile) { renderWidget(); }
    else {
      const poll = setInterval(() => {
        if (window.turnstile) { clearInterval(poll); renderWidget(); }
      }, 200);
      setTimeout(() => clearInterval(poll), 10000);
    }
  });

  onDestroy(() => {
    if (widgetId != null && window.turnstile) {
      try { window.turnstile.remove(widgetId); } catch (_) {}
    }
  });
</script>

{#if siteKey}
  <div class="turnstile-wrapper" bind:this={container}></div>
{/if}
```

Load the script in `app.html`:
```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
```

### Backend: Server-Side Verification

```javascript
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY;
const TURNSTILE_ENABLED = !!TURNSTILE_SECRET;

async function verifyTurnstile(token) {
    if (!TURNSTILE_ENABLED) return true;  // Skip when not configured
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
```

### Where to Apply
- **Login** -- prevents credential stuffing
- **Registration** -- prevents mass fake signups
- **Password reset** -- prevents reset token abuse
- **Resend verification** -- prevents email spam
- **Feedback forms** -- prevents spam submissions

### Frontend Integration Pattern

The frontend discovers Turnstile availability via `/api/auth/status`:

```javascript
// Server returns: { authEnabled, turnstileSiteKey, stripePublishableKey }
const status = await fetch('/api/auth/status').then(r => r.json());

// Forms conditionally render Turnstile and pass token with requests
<Turnstile siteKey={status.turnstileSiteKey} onverify={(t) => turnstileToken = t} />
```

Forms include `turnstileToken` in their POST body. The server rejects with 403 if verification fails.

---

## SEO & Open Graph

### Meta Tags in `app.html`

Every app should include these in the `<head>` of `app.html`:

```html
<!-- Primary meta -->
<meta name="description" content="One-line description of your app." />

<!-- Open Graph (link previews in Slack, iMessage, Facebook, etc.) -->
<meta property="og:type" content="website" />
<meta property="og:title" content="App Name" />
<meta property="og:description" content="Short compelling description." />
<meta property="og:image" content="/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />

<!-- Twitter/X card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="App Name" />
<meta name="twitter:description" content="Short compelling description." />
<meta name="twitter:image" content="/og-image.png" />
```

### OG Image
- Create a 1200x630px PNG (`/og-image.png`) in the `static/` directory
- Include app name, tagline, and visual branding
- This is what appears when someone shares a link on social media or Slack
- Tools: Figma, Canva, or generate with an AI image tool

### Favicon
- Provide multiple formats for broad compatibility:
```html
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
```

### Per-Route Meta (Dynamic)
For shareable content pages (e.g., `/share/[token]`), use SvelteKit's `<svelte:head>`:

```svelte
<svelte:head>
    <title>{dynamicTitle} — App Name</title>
    <meta property="og:title" content={dynamicTitle} />
    <meta property="og:description" content={dynamicDescription} />
</svelte:head>
```

### SEO Checklist
- [ ] Unique `<title>` per route
- [ ] `<meta name="description">` on every page
- [ ] OG image created and referenced
- [ ] Favicon in SVG + PNG formats
- [ ] Semantic HTML (`<main>`, `<nav>`, `<article>`, `<h1>`-`<h3>`)
- [ ] `lang="en"` on `<html>` tag
- [ ] Shared content pages have dynamic OG tags for rich previews
- [ ] `robots.txt` in `static/` (allow all, or block admin routes)
- [ ] `sitemap.xml` if you have public-facing content pages

---

## Logging

### Structured Logger

Use a simple structured logger instead of raw `console.log`. This makes logs parseable and filterable in production (Render logs, `grep`, etc.):

```javascript
const log = {
    _fmt(level, ctx, msg) {
        const ts = new Date().toISOString();
        console.log(`[${ts}] [${level}] [${ctx}] ${msg}`);
    },
    info(ctx, msg)  { this._fmt('INFO', ctx, msg); },
    warn(ctx, msg)  { this._fmt('WARN', ctx, msg); },
    error(ctx, msg) { this._fmt('ERROR', ctx, msg); },
};
```

**Output example:**
```
[2026-03-29T14:22:01.123Z] [INFO] [auth] Login: user@example.com
[2026-03-29T14:22:01.456Z] [ERROR] [stripe] Webhook signature verification failed
[2026-03-29T14:22:02.789Z] [WARN] [advice] Rate limit reached for user@example.com
```

### What to Log

| Context | Events |
|---------|--------|
| `auth` | Login success/failure, registration, password reset, email verification |
| `stripe` | Checkout created, webhook events, subscription changes, errors |
| `advice` | Queries (user + model), rate limit hits, API errors |
| `admin` | User approvals, invite code creation, tier changes |
| `turnstile` | Verification failures |
| `db` | Connection errors, migration runs |
| `server` | Startup banner, port, mode, HTTPS redirects |

### Logging Principles

1. **Always include context** -- `log.info('auth', ...)` not just `log.info(...)`. Makes `grep` and log filtering trivial.
2. **Log the "who"** -- include user email for auth/usage events so you can trace activity.
3. **Never log secrets** -- no passwords, tokens, API keys, or full request bodies.
4. **Log errors with enough to debug** -- include error messages but not full stack traces for expected errors (bad input, rate limits). Use full stack traces only for unexpected errors.
5. **Startup banner** -- log server config on boot (port, model, auth status, DB connection) so you can verify deployment config at a glance:

```javascript
console.log(`\n♠  My App Server`);
console.log(`────────────────────────────`);
console.log(`   Server:  http://localhost:${PORT}`);
console.log(`   Auth:    ${AUTH_ENABLED ? 'ENABLED' : 'DISABLED (dev mode)'}`);
console.log(`   DB:      connected`);
console.log(`   Mode:    ${process.env.NODE_ENV || 'development'}`);
console.log(`────────────────────────────\n`);
```

### When to Upgrade

The simple logger above works well for single-instance apps on Render/Vercel. Consider upgrading to **pino** or **winston** when you need:
- JSON-structured logs for log aggregation (Datadog, Logtail, etc.)
- Log levels configurable via env var
- Request ID tracing across middleware
- Log rotation or file output

---

## UI & Styling Approach

- **No external UI library** -- custom Svelte components only
- **Dark theme** with accent color (e.g., `#d4af37` gold)
- **Scoped styles** in `.svelte` files + global `app.css` for variables/reset
- **CSS Grid/Flexbox** for layout, responsive by default
- **CSS custom properties** for theming:

```css
:root {
    --bg-primary: #080c12;
    --bg-secondary: #0d1117;
    --text-primary: #d0dae4;
    --accent: #d4af37;
    --danger: #e74c3c;
    --success: #27ae60;
    --radius: 8px;
}
```

---

## Legal Pages

Include `/terms` and `/privacy` routes. Key sections:

**Terms of Service:**
- Service description and limitations
- Account requirements (age, one account per person)
- Acceptable use policy
- AI disclaimer (not professional advice)
- Termination rights

**Privacy Policy:**
- What data is collected (email, name, usage, queries)
- How data is used (service delivery, AI processing)
- Third-party sharing (AI provider only)
- Data retention and deletion
- Cookie usage (JWT session token)

---

## Sharing / Public Access Pattern

For user-generated content sharing:

1. Generate a URL-safe token (`crypto.randomBytes(24).toString('base64url')`)
2. Store as `share_token` on the record
3. Public route `/api/share/:token` returns data without auth
4. Frontend route `/share/[token]` renders a read-only view
5. User can revoke by deleting the share token

---

## CLI User Management

Include a CLI script for bootstrapping:

```bash
npm run users:add -- --email admin@example.com --password secret --tier admin
npm run users:list
npm run users:remove -- --email user@example.com
```

Useful for creating the first admin account before the UI exists.

---

## Checklist for New Apps

- [ ] Clone structure, update `package.json` names
- [ ] Set up Supabase project, run `npm run db:init`
- [ ] Create `.env` from `.env.example` with required vars
- [ ] Create admin user via CLI
- [ ] Replace domain logic in `lib/[domain]/`
- [ ] Customize system prompt for AI persona
- [ ] Update legal pages with app-specific content
- [ ] Set up Stripe product + price for pro tier
- [ ] Configure Resend domain or use default
- [ ] Set up Render blueprint or Vercel config
- [ ] Add Turnstile keys for bot protection
- [ ] Connect GitHub repo for CI/CD auto-deploy
- [ ] Generate and distribute invite codes for early users

---

## Cost Breakdown (Bootstrapping)

| Service | Free Tier | When to Upgrade |
|---------|-----------|----------------|
| Supabase | 500MB, 2 projects | ~10k+ users |
| Render | 750 hrs/mo (spins down) | Need always-on ($7/mo Starter) |
| Resend | 100 emails/day | High volume signups |
| Stripe | 2.9% + 30c per txn | Never (pay-per-use) |
| Cloudflare Turnstile | Unlimited | Never (always free) |
| GitHub Actions | 2000 min/mo (private) | Very active repo |
| Claude API | Pay-per-token | ~$0.003/query with Sonnet |
