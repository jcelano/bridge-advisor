# ♠ The Stayman Whisperer

AI-powered bridge analysis tool that works with [Trickster Cards](https://www.trickstercards.com/games/bridge/) PBN export. Get expert bidding, opening lead, card play, and post-mortem analysis powered by Claude.

**Svelte 5 frontend** with a shared Express backend.

## Quick Start

```bash
cd bridge-advisor

# 1. Install everything
npm run install:all

# 2. Configure
cp .env.example .env
# Edit .env: add ANTHROPIC_API_KEY, DATABASE_URL, and JWT_SECRET

# 3. Initialize the database tables
npm run db:init

# 4. Create your first user account
npm run users:add
# Follow the prompts for email, name, password

# 5. Run the app
npm run svelte      # → http://localhost:5174
```

## Database Setup (Supabase — Free)

The app uses PostgreSQL for user accounts and advice history. [Supabase](https://supabase.com) provides a free hosted Postgres database — no credit card required, no expiry.

### What You Get (Free Tier)

- 500 MB database (enough for years of bridge advice)
- Unlimited API requests
- No credit card required
- Projects pause after 7 days of inactivity but wake automatically on next request

### Step-by-Step Setup

1. **Create an account** at [supabase.com](https://supabase.com)

2. **Create a new project**
   - Click "New Project"
   - Give it a name (e.g., "bridge-advisor")
   - **Set a strong database password** — save this, you'll need it
   - Choose a region close to your Render server (e.g., US East)
   - Click "Create new project" and wait ~2 minutes for setup

3. **Get your connection string**
   - Go to **Project Settings** (gear icon in sidebar)
   - Click **Database** in the left menu
   - Scroll to **Connection string** section
   - Select the **URI** tab
   - Copy the connection string — it looks like:
     ```
     postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
     ```
   - Replace `[YOUR-PASSWORD]` with the database password you set in step 2

4. **Add to your environment**
   - **Local dev**: Add to your `.env` file:
     ```
     DATABASE_URL=postgresql://postgres.xxxx:yourpassword@aws-0-us-east-1.pooler.supabase.com:6543/postgres
     ```
   - **Render**: Add as an environment variable in your service settings (see Deployment below)

5. **Create the tables**
   ```bash
   npm run db:init
   ```
   This creates the `users` and `history` tables automatically. The server also runs this on every startup, so tables are always created if missing.

6. **Add your first user**
   ```bash
   npm run users:add
   ```

### Supabase Dashboard

You can browse your data anytime at [supabase.com](https://supabase.com):
- **Table Editor** → See all users and history entries
- **SQL Editor** → Run queries directly
- **Project Settings → Database** → Connection info, password reset

### Alternative: Any Postgres

The app works with any Postgres database. Just set `DATABASE_URL` to a valid connection string. If the host isn't Supabase, set `DB_SSL=true` if SSL is required.

## Authentication

The app includes JWT-based authentication backed by PostgreSQL. Users and advice history persist across deploys.

### Managing Users

```bash
# Add a user (interactive)
npm run users:add

# Add a user (scripted)
npm run users:add -- -e alice@example.com -p her-password -n "Alice"

# List all users
npm run users:list

# Remove a user
npm run users:remove -- -e alice@example.com
```

### Disabling Auth (Local Dev)

If you're running locally and don't want to log in every time:

```bash
# In your .env file:
AUTH_ENABLED=false
```

### Auth Details

- Passwords are hashed with bcrypt (12 rounds)
- JWT tokens expire after 7 days (configurable via `JWT_EXPIRY`)
- The frontend stores the token in localStorage and auto-verifies on page load
- Expired tokens redirect to the login page

## Deployment

### Render + Supabase (Recommended)

The app is configured for Render's Starter plan ($7/mo) with Supabase free Postgres.

#### Prerequisites

- A [Supabase](https://supabase.com) project with the connection string (see Database Setup above)
- An [Anthropic API key](https://console.anthropic.com/settings/keys)
- The project pushed to a GitHub repo

#### Deploy to Render

1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect your GitHub repo
3. Render detects `render.yaml` and configures the build automatically
4. Set these environment variables when prompted:
   - `ANTHROPIC_API_KEY` — your Claude API key
   - `DATABASE_URL` — your Supabase connection string (the full `postgresql://...` URI)
   - `JWT_SECRET` — Render auto-generates this
5. Click **Create Web Service**
6. Wait for the first deploy to complete (~2-3 minutes)

#### Add Users After Deploy

In Render: go to your service → **Shell** tab, then run:

```bash
node server/manage-users.js add -e you@email.com -p yourpassword -n "Your Name"
node server/manage-users.js add -e partner@email.com -p theirpass -n "Partner"
```

Or list existing users:
```bash
node server/manage-users.js list
```

#### Updating

Push to GitHub → Render auto-deploys. Your users and history are safe in Supabase — Render deploys don't touch the database.

### Option 2: Vercel (Free Hobby Tier)

1. Push to GitHub
2. Import the repo at [vercel.com](https://vercel.com)
3. Set environment variables in the Vercel dashboard:
   - `ANTHROPIC_API_KEY`
   - `DATABASE_URL` — your Supabase connection string
   - `JWT_SECRET`
   - `AUTH_ENABLED=true`
4. Deploy

### Option 3: DigitalOcean / Any VPS ($4-5/mo)

```bash
# On your server:
git clone <your-repo>
cd bridge-advisor
npm run install:all
cp .env.example .env
# Edit .env with ANTHROPIC_API_KEY, DATABASE_URL, JWT_SECRET

# Initialize database and build frontend
npm run db:init
npm run build:svelte

# Add users
npm run users:add

# Start with PM2 for auto-restart
npx pm2 start server/index.js --name bridge-advisor
npx pm2 save
```

### Option 4: Run Locally ($0)

Just run `npm run svelte` on your laptop when you play. Simplest, most secure, no deployment needed.

## Features

- **Manual Input**: Click to select your cards, enter bids with a visual bidding box
- **PBN Import**: Paste PBN exports directly from Trickster Cards
- **PBN Export**: Export your current hand state to PBN format
- **Bidding Advice**: Get recommendations based on SAYC or 2/1 Game Forcing
- **Opening Lead Advice**: Optimal lead selection with reasoning
- **Card Play Advice**: Declarer play and defensive guidance
- **Full Analysis**: Post-mortem review of completed hands
- **Prompt Preview**: See exactly what gets sent to Claude
- **Advice History**: Track all advice received for the current hand
- **Convention System**: Choose between SAYC and 2/1 Game Forcing

## Using with Trickster Cards

### Importing a completed hand (PBN)

1. In Trickster Cards, enable **"Review last deal"** in game rules
2. Play your hand
3. During "Review last deal": menu → **Current Game** → **Export Hand to PBN**
4. Paste into Bridge Advisor's **Paste PBN** tab → **Import PBN**
5. Choose advice type → **Get Advice**

### Mid-game advice (Manual Input)

1. **Manual Input** tab → set seat, dealer, vulnerability
2. Click cards to build your hand
3. Enter bids using the bidding box
4. Toggle "Show Dummy" if dummy is visible
5. Select advice type → **Get Advice**

## Project Structure

```
bridge-advisor/
├── server/
│   ├── index.js              # Express server (API + auth routes)
│   ├── db.js                 # Postgres connection pool + schema
│   ├── auth.js               # JWT auth, user management (Postgres)
│   └── manage-users.js       # CLI tool for adding/removing users
├── shared/                   # Reference copies of shared code
│   ├── bridge/               # constants, PBN parser, prompt builder
│   └── api.js                # Frontend API client with auth
├── svelte-app/               # SvelteKit + Svelte 5 frontend (:5174)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── +layout.js       # SPA mode (ssr=false)
│   │   │   ├── +layout.svelte   # Auth guard, header, footer
│   │   │   └── +page.svelte     # Bridge advisor UI
│   │   ├── lib/
│   │   │   ├── bridge/           # Shared logic (constants, PBN, prompt)
│   │   │   ├── components/       # Svelte 5 components (runes)
│   │   │   └── api.js            # API client with auth
│   │   ├── app.html
│   │   └── app.css
│   ├── svelte.config.js         # adapter-static → dist-svelte/
│   └── vite.config.js
├── render.yaml               # Render deployment blueprint
├── vercel.json               # Vercel deployment config
├── .env.example
└── package.json
```

## All Scripts

| Command | Description |
|---------|-------------|
| `npm run install:all` | Install deps for root + Svelte frontend |
| `npm run svelte` | Express backend + Svelte 5 dev server |
| `npm run build:svelte` | Build Svelte for production |
| `npm run start:svelte` | Serve production Svelte build + API |
| `npm run users:add` | Add a user account |
| `npm run users:list` | List all users |
| `npm run users:remove` | Remove a user account |
| `npm run db:init` | Create database tables (also runs on server start) |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | (required) | Your Anthropic API key |
| `DATABASE_URL` | (required) | Postgres connection string |
| `JWT_SECRET` | (required for prod) | Random string for signing tokens |
| `JWT_EXPIRY` | `7d` | How long tokens last |
| `AUTH_ENABLED` | `true` | Set `false` to skip login |
| `DB_SSL` | auto | Force SSL for DB (`true`/`false`, auto for Supabase) |
| `CLAUDE_MODEL` | `claude-sonnet-4-20250514` | Claude model |
| `PORT` | `3001` | Backend port |
| `SERVE_DIR` | `dist-svelte` | Which build to serve in production |

## API Costs

- Each query: ~$0.01–0.03 (Claude Sonnet)
- Typical session (20 hands, 2-3 queries each): ~$0.60–1.80
- Monthly estimate for regular play: **$3–10**

## SvelteKit Architecture Notes

The Svelte frontend uses **SvelteKit** with **Svelte 5 runes** throughout:

- **SvelteKit** with `adapter-static` — builds to static files served by the Express backend (same as React)
- **File-based routing**: `+layout.svelte` handles auth/chrome, `+page.svelte` is the game UI
- **`$lib`** aliases for clean imports: `$lib/bridge/constants.js`, `$lib/components/...`
- **SPA mode**: `ssr = false` in `+layout.js` since all data comes from the Express API
- **Svelte 5 runes**: `$state()`, `$derived`, `$derived.by()`, `$bindable()`, `$props()`, `$effect()`
- **Modern event syntax**: `onclick` instead of legacy `on:click`
- **Snippet rendering**: `{@render children()}` in layout (Svelte 5 replacement for slots)

In dev mode, Vite proxies `/api/*` to the Express server on port 3001. In production, Express serves both the static build and the API on a single port.

## License

MIT
