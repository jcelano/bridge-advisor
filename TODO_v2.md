# Production Readiness v2 — Changes & Manual Steps

## What Was Implemented

### Phase 1: Security Hardening
- **Removed password logging** — `server/auth.js` no longer logs plaintext passwords during login
- **New JWT secret** — replaced weak "quick brown fox" with 48-byte random hex string
- **CORS lockdown** — `cors()` now uses an origin whitelist via `ALLOWED_ORIGINS` env var (defaults to localhost only)
- **Payload size limit** — `express.json({ limit: '50kb' })` prevents oversized requests
- **HTTPS redirect** — production middleware redirects HTTP to HTTPS via `x-forwarded-proto` header
- **Removed DB URL logging** — `server/db.js` no longer logs the connection string

### Phase 2: Database Schema
New columns and tables added to `server/db.js` schema (auto-migrates on startup):

- **`users` table** — added `tier` (free/pro/admin), `daily_limit` (default 10), `approved` (boolean)
- **`invite_codes` table** — code, created_by, used_by, tier, uses_remaining, expires_at
- **`daily_usage` table** — user_email, usage_date, query_count, tokens_used (unique per user per day)
- **Auto-migration** — existing users are set to `approved=true` on first run

### Phase 3: User Signup & Access Control
New API endpoints:

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/auth/register` | No | Register with optional invite code |
| `GET /api/admin/pending` | Admin | List pending access requests |
| `POST /api/admin/approve/:email` | Admin | Approve a user |
| `POST /api/admin/invite-codes` | Admin | Generate invite codes |
| `GET /api/admin/invite-codes` | Admin | List all invite codes |
| `GET /api/admin/users` | Admin | List all users |
| `GET /api/admin/usage` | Admin | Today's aggregate usage stats |

Registration flow:
- **With invite code** — user is created with `approved=true`, auto-logged in
- **Without invite code** — user is created with `approved=false`, sees "pending approval" message
- **Login** now checks `approved` flag; returns 401 "Account pending approval" if not approved
- **JWT** now includes `tier` claim for admin/tier checks

New files:
- `svelte-app/src/lib/components/Signup.svelte` — registration form with invite code toggle
- `svelte-app/src/lib/components/AdminDashboard.svelte` — admin panel for approvals, invite codes, usage stats

### Phase 4: Daily Rate Limiting
- **`checkRateLimit` middleware** on `POST /api/advice` — checks `daily_usage` table against user's `daily_limit`
- **429 response** when limit exceeded, includes `{ limit, used, tier, resetsAt }`
- **Usage increment** — `daily_usage.query_count` bumped after each successful Claude response
- **`GET /api/usage`** — authenticated endpoint returning `{ tier, dailyLimit, usedToday, remainingToday, tokensToday }`
- **Frontend handling** — `getAdvice()` in `api.js` now catches 429 and shows user-friendly message

### Phase 5: Landing Page
- **`Landing.svelte`** — public page with hero, features grid, how-it-works steps, pricing comparison, CTA
- **Layout routing** — unauthenticated visitors see: Landing → Login or Signup (user's choice)
- **Login.svelte** — added "Don't have an account? Create one" link
- **Signup.svelte** — email/password/name form with optional invite code; shows success message for pending requests

### Phase 6: Usage Dashboard & Tier Display
- **Header usage badge** — shows "X/Y today" with color coding (green/yellow/red)
- **Tier badges** — "admin" or "pro" badge next to user name in header
- **Usage refresh** — auto-refreshes after each advice request via `usage-changed` custom event
- **Admin tab** — visible only to admin users, contains:
  - Today's usage stats (queries, active users, tokens)
  - Pending access requests with approve buttons
  - Invite code generator with tier/uses controls
  - Invite code list with status

### Phase 7: Chrome Extension Reliability
- **JSON payload parsing** — fetch interceptor (Strategy A) now parses JSON responses and recursively searches nested fields for PBN strings
- **MutationObserver throttling** — scanDOM now debounced via `requestAnimationFrame` (was firing on every DOM mutation)
- **Text-based hand-end fallback** — in addition to hardcoded `#scorecard` and `#review-deal-message` IDs, now also checks for text patterns like "hand complete", "final score", "export hand to pbn"
- **main-world.js injection retry** — background.js now retries injection up to 3 times with 500ms backoff
- **Debug logging toggle** — popup has checkbox to enable debug logging; content.js logs which strategy captured PBN and timing info
- **Source tagging** — all `onPBNDetected()` calls now include a source parameter (e.g., "fetch interceptor", "WebSocket raw", "DOM MutationObserver")

### Phase 8: Production Polish
- **Structured logger** — `log.info(context, message)` / `log.warn()` / `log.error()` with `[timestamp] [LEVEL] [context] message` format
- **Enhanced health check** — `GET /api/health` now tests DB connectivity, returns `{ status: 'ok'|'degraded', db: bool }`
- **Global error handler** — Express catch-all middleware for unhandled errors
- **`.env.example`** — updated with `ALLOWED_ORIGINS` documentation

---

## Manual Steps Required

### 1. Rotate Credentials (CRITICAL — do before deploying)

Your Anthropic API key, Supabase password, and old JWT secret were previously committed to git history.

- [ ] **Rotate Anthropic API key** at https://console.anthropic.com/settings/keys
  - Delete the old key, create a new one
  - Update `.env` with the new key
  - Update Render env vars

- [ ] **Rotate Supabase database password** in the Supabase dashboard
  - Project Settings → Database → Reset database password
  - Update `DATABASE_URL` in `.env` and Render env vars

- [ ] **Update Render env vars** with:
  - New `ANTHROPIC_API_KEY`
  - New `DATABASE_URL`
  - New `JWT_SECRET` (already generated in `.env`: `87bdede836...`)
  - New `ALLOWED_ORIGINS` (e.g., `https://your-app.onrender.com`)

### 2. Set Up Cloudflare Turnstile (Bot Protection)

- [ ] **Create a free Cloudflare account** at https://dash.cloudflare.com (if you don't have one)
- [ ] **Create a Turnstile widget** at https://dash.cloudflare.com/?to=/:account/turnstile
  - Add your production domain (e.g., `your-app.onrender.com`)
  - Add `localhost` for local dev
  - Widget type: "Managed" (recommended)
- [ ] **Copy the Site Key and Secret Key** from the Turnstile dashboard
- [ ] **Add to `.env`** (local dev):
  - `TURNSTILE_SITE_KEY=0x4AAAAAAA...`
  - `TURNSTILE_SECRET_KEY=0x4AAAAAAA...`
- [ ] **Add to Render env vars** (production):
  - `TURNSTILE_SITE_KEY` — same site key
  - `TURNSTILE_SECRET_KEY` — same secret key

> Without these, Turnstile is skipped and forms work without bot protection. Once set, the widget appears on Login, Signup, Feedback, and Password Reset forms.

### 3. Set Up Resend (Email)

- [ ] **Create a free Resend account** at https://resend.com (100 emails/day free)
- [ ] **Get your API key** at https://resend.com/api-keys
- [ ] **Add to `.env`** (local dev):
  - `RESEND_API_KEY=re_xxxxxxxx`
  - `APP_URL=http://localhost:5174`
  - `ADMIN_EMAIL=your@email.com`
- [ ] **Add to Render env vars** (production):
  - `RESEND_API_KEY` — same API key
  - `APP_URL=https://your-app.onrender.com`
  - `ADMIN_EMAIL=your@email.com`
- [ ] **Optional**: Verify a custom domain in Resend to send from your own address, then set `EMAIL_FROM=noreply@yourdomain.com`

> Without `RESEND_API_KEY`, password reset links and admin notifications are logged to the server console instead of emailed. Everything still works — you just have to check the logs manually.

### 5. Set Your Account as Admin

After deploying and the schema migration runs, connect to your database and run:

```sql
UPDATE users SET tier = 'admin', approved = true WHERE email = 'your@email.com';
```

You can do this via:
- Supabase SQL Editor (Dashboard → SQL Editor)
- Render Shell: `node server/manage-users.js` (doesn't support tier yet — use SQL directly)

### 6. Test the Full Flow

- [ ] Visit the site unauthenticated — verify landing page appears
- [ ] Click "Get Started" — verify signup form with invite code toggle
- [ ] Register without invite code — verify "pending approval" message
- [ ] Log in as admin — verify admin tab appears
- [ ] Approve the pending user from admin dashboard
- [ ] Generate an invite code from admin dashboard
- [ ] Register a new user with the invite code — verify auto-login
- [ ] Make 10+ analyses as a free user — verify 429 rate limit
- [ ] Check usage badge updates in header after each analysis
- [ ] Click "Forgot password?" on login → enter email → check for email (or server console log)
- [ ] Click reset link → set new password → verify login works with new password
- [ ] Submit feedback via footer link → verify it appears in admin dashboard
- [ ] Register without invite code → verify admin receives notification email (or console log)

### 7. Chrome Extension

- [ ] Reload the extension in `chrome://extensions` (the code changed)
- [ ] Update the Bridge Advisor URL in the popup to your production URL
- [ ] Enable debug logging, play a hand on Trickster, check console for strategy logs
- [ ] Verify PBN detection works after hand completion

### 8. Optional Future Work

- [ ] Add email verification (currently skipped for MVP)
- [ ] Add Stripe integration for Pro tier payments
- [ ] Add terms of service / privacy policy pages
- [ ] Publish Chrome extension to Chrome Web Store ($5 one-time fee)
- [ ] Add E2E tests for registration and rate limiting flows
- [ ] Consider moving JWT to HttpOnly cookies for XSS protection
- [ ] Add CSRF protection for state-changing endpoints

---

## Phase 11: Password Reset via Email (Resend)
- **`resend` package** installed — Resend SDK for transactional email (free: 100 emails/day)
- **`sendEmail()` helper** in `server/index.js` — wraps Resend SDK, falls back to console.log if `RESEND_API_KEY` not set
- **Schema**: added `reset_token` (TEXT UNIQUE) and `reset_token_expires` (TIMESTAMPTZ) columns to users table
- **`generateResetToken(email)`** in `server/auth.js` — generates `crypto.randomBytes(32)`, stores SHA-256 hash in DB, returns raw token. 15-minute expiry.
- **`verifyResetToken(token)`** — hashes the provided token, looks up matching unexpired row
- **`resetPassword(email, newPassword)`** — hashes new password, clears reset token fields
- **`POST /api/auth/forgot-password`** (public, Turnstile-protected) — generates token, sends branded HTML email with reset link. Always returns success (doesn't leak whether email exists).
- **`POST /api/auth/reset-password`** (public, Turnstile-protected) — validates token, updates password, returns success
- **`ForgotPassword.svelte`** — email input + Turnstile, shows "check your email" on success
- **`ResetPassword.svelte`** — new password + confirm + Turnstile, reads token from `?reset=TOKEN` URL param
- **Login.svelte** — added "Forgot password?" link below password field
- **Layout routing** — `authView` now supports `'forgot'` and `'reset'` states; auto-detects `?reset=TOKEN` in URL on page load

## Phase 12: Admin Email Notifications
- **Access request emails** — when a user registers without an invite code, the admin receives an email notification with the user's name and a link to the admin dashboard
- **`ADMIN_EMAIL` env var** — configures who receives notifications
- Falls back to console.log if Resend not configured

### Manual Steps
- [ ] Create a Resend account at https://resend.com (free tier)
- [ ] Get your API key from https://resend.com/api-keys
- [ ] Add to `.env` and Render env vars:
  - `RESEND_API_KEY=re_xxxxxxxx`
  - `APP_URL=https://your-app.onrender.com`
  - `ADMIN_EMAIL=your@email.com`
- [ ] Optional: verify a custom domain in Resend to send from your own address (set `EMAIL_FROM`)

### New Files
```
svelte-app/src/lib/components/ForgotPassword.svelte  — forgot password form
svelte-app/src/lib/components/ResetPassword.svelte    — reset password form (from email link)
```

### Modified Files
```
server/auth.js          — generateResetToken, verifyResetToken, resetPassword functions
server/index.js         — Resend integration, forgot-password/reset-password endpoints, admin notification
server/db.js            — reset_token and reset_token_expires columns
svelte-app/src/lib/api.js               — requestPasswordReset, confirmPasswordReset functions
svelte-app/src/lib/components/Login.svelte — "Forgot password?" link + onforgot prop
svelte-app/src/routes/+layout.svelte     — forgot/reset auth views, ?reset=TOKEN detection
.env.example            — RESEND_API_KEY, APP_URL, ADMIN_EMAIL, EMAIL_FROM docs
package.json            — resend dependency
```

---

## Phase 9: Bot Protection (Cloudflare Turnstile)
- **Server-side `verifyTurnstile()` helper** in `server/index.js` — POSTs to Cloudflare's siteverify endpoint
- **Protects 3 public form endpoints**: `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/feedback`
- **Graceful fallback** — when `TURNSTILE_SECRET_KEY` is not set or `AUTH_ENABLED=false`, Turnstile is skipped (dev mode works without it)
- **`/api/auth/status`** now returns `turnstileSiteKey` so the frontend can configure the widget
- **Reusable `Turnstile.svelte` component** — renders the widget with `render=explicit`, dark theme, handles expiry
- **Integrated into**: Login form, Signup form, Feedback modal
- **Turnstile script** loaded in `app.html` `<head>` with `async defer`

### Manual Steps
- [ ] Create a free Cloudflare account at https://dash.cloudflare.com
- [ ] Go to Turnstile, create a widget for your domain
- [ ] Add `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` to your `.env` and Render env vars

---

## Phase 10: Feedback Form
- **`feedback` table** added to `server/db.js` — stores category, message, browser_info (JSONB), page_url, user_email
- **`POST /api/feedback`** (public, Turnstile-protected) — accepts feedback with auto-captured browser info
  - Optionally extracts user from Bearer token if logged in
  - Validates message (required, max 2000 chars)
- **`GET /api/admin/feedback`** (admin only) — paginated feedback list for admin review
- **`FeedbackModal.svelte`** — modal overlay with:
  - Category selector (General Feedback, Bug Report, Question, Feature Request)
  - Message textarea with character counter
  - Email field (auto-filled for logged-in users, optional for anonymous)
  - Turnstile widget
  - Auto-captured browser info (not shown to user): userAgent, viewport, language, platform, screen size, color depth, online status, app version, user tier
- **Footer "Feedback" link** — visible on all pages (including when logged in), opens the modal
- **Admin dashboard** — new "User Feedback" section showing all submissions with category tags, message, expandable browser info details

---

## Files Changed

```
server/auth.js          — removed password logging, added tier/invite/admin functions
server/index.js         — CORS, rate limiting, registration, admin routes, structured logging,
                          Turnstile verification, feedback endpoint
server/db.js            — new schema (tiers, invite_codes, daily_usage, feedback), removed URL logging
.env                    — new JWT secret
.env.example            — added ALLOWED_ORIGINS, TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY docs

svelte-app/src/app.html                          — Turnstile script tag
svelte-app/src/lib/api.js                        — register, usage, admin, feedback API functions
svelte-app/src/lib/components/Turnstile.svelte    — NEW: reusable Cloudflare Turnstile widget
svelte-app/src/lib/components/FeedbackModal.svelte — NEW: feedback modal with browser info capture
svelte-app/src/lib/components/Landing.svelte      — NEW: public landing page
svelte-app/src/lib/components/Signup.svelte       — NEW: registration form + Turnstile
svelte-app/src/lib/components/AdminDashboard.svelte — NEW: admin panel + feedback section
svelte-app/src/lib/components/Login.svelte        — added signup link + Turnstile
svelte-app/src/routes/+layout.svelte              — landing/signup routing, usage badge, tier display,
                                                    feedback modal, Turnstile site key passthrough
svelte-app/src/routes/+page.svelte                — admin tab, usage refresh event

chrome-extension/content.js    — JSON parsing, throttled observer, text fallbacks, debug logging
chrome-extension/background.js — injection retry logic
chrome-extension/popup.html    — debug toggle UI
chrome-extension/popup.js      — debug toggle persistence
```
