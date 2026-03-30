# ShieldTest

**DNS and web filtering benchmark platform for defensive security testing.**

ShieldTest measures how effectively a network's DNS filtering blocks malicious domains, phishing sites, adult content, and ad/tracker networks — without ever rendering, downloading, or executing anything dangerous.

Deploy it on a server, run a lightweight probe on any device behind the network you want to test, and get a scored report showing exactly what your router or firewall is blocking (and what it's missing).

**Live instance:** [https://my6.my/shieldtest/](https://my6.my/shieldtest/)

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  ShieldTest Server (your VPS)                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ Fastify   │  │ BullMQ   │  │ Scoring  │  │ React         │   │
│  │ API       │  │ Queue    │  │ Engine   │  │ Dashboard     │   │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘   │
│  ┌──────────┐  ┌──────────┐                                     │
│  │ PostgreSQL│  │ Redis    │                                     │
│  └──────────┘  └──────────┘                                     │
└──────────────────────────────────┬──────────────────────────────┘
                                   │ HTTPS API
                                   │
┌──────────────────────────────────┴──────────────────────────────┐
│  Network Under Test                                             │
│  ┌────────────┐     ┌──────────┐     ┌──────────────────────┐   │
│  │ Probe Agent │────▶│ Router / │────▶│ DNS Resolver         │   │
│  │ (any device)│     │ Firewall │     │ (tests if domains    │   │
│  └────────────┘     └──────────┘     │  are blocked)        │   │
│                                       └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

1. **Server** ingests public threat intelligence feeds (URLhaus, OpenPhish, PhishTank, StevenBlack, Tranco)
2. **You create a benchmark** — the server samples domains across malware, phishing, adult, ads/tracker, and clean categories
3. **Probe agent** runs on a device behind the router you're testing — it performs DNS lookups through that network
4. **Server scores the results** — blocked threats = good, allowed threats = bad, blocked clean sites = false positive
5. **Dashboard** shows your score (0–100), category breakdown, and detailed results

---

## Quick Start

### Prerequisites

- **Server:** Linux (Ubuntu 22.04+), Node.js 20+, PostgreSQL 14+, Redis 7+, NGINX
- **Probe device:** Any machine with Node.js 18+ (Mac, Windows, Linux)

### Server Setup

```bash
# Clone
git clone https://github.com/pendakwahteknologi/shieldtest.git
cd shieldtest

# Install dependencies
npm install

# Build shared types
npm run build -w packages/shared

# Set up PostgreSQL
sudo -u postgres psql -c "CREATE USER shieldtest WITH PASSWORD 'shieldtest';"
sudo -u postgres psql -c "CREATE DATABASE shieldtest OWNER shieldtest;"

# Configure environment
cp .env.example .env
# Edit .env with your database credentials and a random session secret

# Run database migrations
cd packages/backend
DATABASE_URL=postgresql://shieldtest:shieldtest@localhost:5432/shieldtest npx drizzle-kit migrate
cd ../..

# Seed the threat intelligence sources
npx tsx packages/backend/src/scripts/seed-sources.ts

# Create your admin user
npx tsx packages/backend/src/scripts/create-user-noninteractive.ts admin yourpassword

# Build the frontend
npm run build -w packages/frontend

# Start with PM2
pm2 start "npx tsx packages/backend/src/server.ts" --name shieldtest
pm2 save
```

### NGINX Configuration

Add this inside your existing server block:

```nginx
location /shieldtest/assets/ {
    alias /path/to/shieldtest/packages/frontend/dist/assets/;
    expires 1y;
    add_header Cache-Control "public, immutable";
}

location /shieldtest/api/ {
    proxy_pass http://127.0.0.1:3847/shieldtest/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 2m;
    proxy_read_timeout 60s;
}

location /shieldtest/ {
    # Symlink or copy dist/ into your web root as 'shieldtest/'
    try_files $uri $uri/ /shieldtest/index.html;
}
```

Reload NGINX: `sudo nginx -s reload`

### Running a Benchmark

1. Log in at `https://yourserver/shieldtest/`
2. Go to **Sources** → click **Sync** on each source to pull threat data
3. Go to **Profiles** → create a benchmark profile (e.g. 50 samples per category)
4. Go to **Probes** → register a probe and copy the `.env` config
5. Set up the probe on a device behind the network you're testing (see below)
6. Go to **Runs** or trigger a run via the API
7. The probe picks up the job automatically, tests domains, and exits when done
8. View your results on the dashboard

---

## Probe Setup

The probe runs on any device connected to the network you want to test. It performs DNS lookups through that network's resolver and reports whether domains are blocked or allowed.

### Install

```bash
# Requires Node.js 18+
git clone https://github.com/pendakwahteknologi/shieldtest.git
cd shieldtest/packages/probe
npm install
```

### Configure

Create a `.env` file (get credentials from the Probes page in the web UI):

```bash
SERVER_URL=https://yourserver/shieldtest/api
PROBE_ID=your-probe-uuid
PROBE_TOKEN=your-probe-token
DNS_ONLY=true
POLL_INTERVAL_MS=3000
HEARTBEAT_INTERVAL_MS=15000
```

### Run

```bash
npx tsx src/index.ts
```

The probe will:
- Connect to the server and wait for jobs
- Test each domain via DNS lookup through your network
- Report results (blocked/allowed/error for each domain)
- Exit automatically when the benchmark is complete

```
  ShieldTest Probe Agent
  ──────────────────────
  Server:    https://my6.my/shieldtest/api
  Probe ID:  be435ed5-...
  DNS-only:  true

  Waiting for benchmark jobs...

  Testing 50 domains...
  ✓ 50 done — 3 blocked, 47 allowed
  Testing 50 domains...
  ✓ 50 done — 8 blocked, 42 allowed
  Testing 50 domains...
  ✓ 50 done — 12 blocked, 38 allowed

  ✓ Benchmark complete — all jobs processed
  ✓ Total domains tested: 150
  ✓ Results submitted to server

  View your results at: https://my6.my/shieldtest/runs
```

---

## Scoring

Each benchmark run produces a score from 0–100 with a letter grade:

| Grade | Score | Meaning |
|-------|-------|---------|
| A | 90–100 | Excellent — strong filtering across all categories |
| B | 75–89 | Good — most threats blocked, minor gaps |
| C | 60–74 | Fair — some filtering active but gaps remain |
| D | 40–59 | Poor — significant threats getting through |
| F | 0–39 | Failing — minimal or no DNS filtering |

### Formula

```
Overall Score = (
    0.35 × Malware Block Rate
  + 0.25 × Phishing Block Rate
  + 0.15 × Adult Filter Rate
  + 0.10 × Ads/Tracker Block Rate
  + 0.10 × Clean Allow Rate
  + 0.05 × Consistency Score
  - Latency Penalty
) × 100
```

- **Block Rate** = threats blocked / (total threats − infrastructure errors)
- **Clean Allow Rate** = safe sites correctly allowed (1 − false positive rate)
- **Consistency** = stability compared to previous run
- **Latency Penalty** = kicks in above 200ms average DNS response, capped at 5 points

Weights are configurable in Settings.

---

## Threat Intelligence Sources

| Source | Category | What it provides |
|--------|----------|-----------------|
| [URLhaus](https://urlhaus.abuse.ch/) | Malware | Active malware distribution URLs |
| [OpenPhish](https://openphish.com/) | Phishing | Community phishing feed |
| [PhishTank](https://phishtank.org/) | Phishing | Verified phishing database |
| [StevenBlack](https://github.com/StevenBlack/hosts) | Ads / Adult | Curated hosts-file blocklists |
| [Tranco](https://tranco-list.eu/) | Clean | Top popular domains (false positive baseline) |

Sources sync automatically on schedule. Manual sync available from the Sources page.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js 20, Fastify, TypeScript |
| Frontend | React 18, Vite, Tailwind CSS, Recharts |
| Database | PostgreSQL 16, Drizzle ORM |
| Queue | Redis 7, BullMQ |
| Probe | Node.js, native DNS module |
| Process Manager | PM2 |
| Web Server | NGINX |

### Project Structure

```
shieldtest/
├── packages/
│   ├── backend/          # Fastify API server
│   │   ├── src/
│   │   │   ├── routes/        # API endpoints
│   │   │   ├── services/      # Business logic
│   │   │   ├── ingestion/     # Source connectors
│   │   │   ├── scoring/       # Score calculation
│   │   │   ├── queue/         # BullMQ workers
│   │   │   ├── db/            # Drizzle schema & migrations
│   │   │   └── middleware/    # Auth, rate limiting
│   │   └── package.json
│   ├── frontend/         # React SPA
│   │   ├── src/
│   │   │   ├── pages/         # Dashboard, Sources, Runs, etc.
│   │   │   ├── components/    # Charts, layout
│   │   │   └── api/           # API client
│   │   └── package.json
│   ├── probe/            # Lightweight test agent
│   │   └── src/
│   │       ├── dns.ts         # DNS resolution
│   │       ├── http.ts        # HTTP HEAD checks
│   │       ├── sinkhole.ts    # Sinkhole detection
│   │       └── worker.ts      # Job polling
│   └── shared/           # Shared TypeScript types
├── config/
│   ├── nginx.conf             # NGINX config example
│   └── ecosystem.config.js    # PM2 config
└── docker-compose.yml         # Optional: local dev databases
```

---

## API Reference

All endpoints under `/shieldtest/api/`. Authentication via session cookie (login first).

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login with username/password |
| POST | `/auth/logout` | Logout |

### Sources
| Method | Path | Description |
|--------|------|-------------|
| GET | `/sources` | List all sources |
| PUT | `/sources/:id` | Enable/disable source |
| POST | `/sources/:id/sync` | Trigger manual sync |
| GET | `/sources/sync-runs` | Sync history |
| GET | `/indicators/stats` | Indicator counts by category |

### Benchmark Profiles
| Method | Path | Description |
|--------|------|-------------|
| GET | `/benchmark-profiles` | List profiles |
| POST | `/benchmark-profiles` | Create profile |
| PUT | `/benchmark-profiles/:id` | Update profile |
| DELETE | `/benchmark-profiles/:id` | Delete profile |
| GET | `/benchmark-profiles/:id/preview` | Preview sample counts |

### Runs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/runs` | List runs |
| POST | `/runs` | Create and start a run |
| GET | `/runs/:id` | Run detail |
| GET | `/runs/:id/results` | Paginated results |
| GET | `/runs/:id/score` | Scorecard |
| DELETE | `/runs/:id` | Delete run |

### Probes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/probes` | Session | List probes |
| POST | `/probes/register` | Session | Register new probe |
| DELETE | `/probes/:id` | Session | Delete probe |
| POST | `/probes/:id/heartbeat` | Token | Probe heartbeat |
| GET | `/probes/:id/jobs` | Token | Poll for work |
| POST | `/probes/:id/results` | Token | Submit results |

### Reports & Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/overview` | Dashboard data |
| GET | `/dashboard/category/:cat` | Category trend |
| GET | `/reports/:runId.csv` | Export CSV |
| GET | `/reports/:runId.json` | Export JSON |
| GET | `/settings` | Get settings |
| PUT | `/settings` | Update settings |
| GET | `/health` | Health check (no auth) |

---

## Safety

ShieldTest is designed for **defensive security testing only**. It benchmarks filtering without becoming a risky browsing tool.

### What it does
- DNS resolution checks (does the domain resolve or return NXDOMAIN?)
- Optional HTTP HEAD requests (is there a block page?)
- Sinkhole IP detection (common filtering indicators)

### What it never does
- Render, screenshot, or preview malicious or adult pages
- Execute JavaScript from target sites
- Download malware payloads or files
- Store page content or bodies
- Encourage manual browsing of harmful sites

### Security controls
- Session-based authentication with bcrypt password hashing
- Brute-force protection (5 attempts, 15-minute lockout)
- Rate limiting on all endpoints
- Probe token authentication (SHA-256 hashed, validated per probe ID)
- No shell execution — all checks use Node.js libraries
- CORS locked to same-origin
- CSP headers via NGINX

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/shieldtest

# Redis
REDIS_URL=redis://localhost:6379

# Server
PORT=3847
NODE_ENV=production
SESSION_SECRET=random-64-char-string-change-this

# Frontend (dev only)
FRONTEND_URL=http://localhost:5173
```

---

## Development

```bash
# Start databases (if using Docker)
docker compose up -d

# Run backend in dev mode (with hot reload)
npm run dev:backend

# Run frontend in dev mode (with hot reload)
npm run dev:frontend

# Run tests
cd packages/backend && npx vitest run

# Generate database migration after schema changes
npm run db:generate

# Apply migrations
npm run db:migrate
```

---

## Use Cases

- **Evaluate router security** — compare consumer routers' built-in filtering
- **Test DNS filtering services** — benchmark Pi-hole, NextDNS, Cloudflare Gateway, OpenDNS
- **Audit enterprise firewalls** — verify FortiGate, Palo Alto, Sophos URL filtering policies
- **Compliance testing** — demonstrate DNS filtering coverage for security audits
- **Before/after comparison** — measure improvement after enabling new security policies
- **Multi-site comparison** — test the same profile across different office locations

---

## Licence

Private project. Not licensed for redistribution.
