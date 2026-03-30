# ShieldTest — Design Specification

**Date:** 2026-03-30
**Status:** Approved

## Overview

ShieldTest is a DNS and web filtering benchmark platform that measures the effectiveness of router security features (malware blocking, phishing blocking, adult content filtering, ads/tracker blocking) without becoming a risky browsing tool. Deployed at `https://my6.my/shieldtest`.

## Architecture

### Approach: Monorepo, Single Process

One repository with npm workspaces containing four packages:

- `packages/backend` — Fastify API server, also serves the built frontend
- `packages/frontend` — React + Vite SPA
- `packages/probe` — Lightweight standalone agent for test devices
- `packages/shared` — Shared TypeScript types and constants

Single PM2 process on the server. NGINX reverse-proxies to Fastify.

### Stack

- **Runtime:** Node.js 20 LTS
- **Backend:** Fastify, TypeScript, Drizzle ORM
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Recharts
- **Database:** PostgreSQL (native install)
- **Cache/Queue:** Redis 7.0 (already running), BullMQ
- **Process Manager:** PM2
- **Web Server:** NGINX 1.24 (already running)
- **Language:** UK English throughout

### Server Specs

- AMD EPYC 9355P (1 vCPU), 4 GB RAM, 48 GB disk
- Ubuntu 24.04 LTS
- 2 GB swap to be added as safety net

## Project Structure

```
shieldtest/
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── routes/           # API route modules
│   │   │   ├── services/         # Business logic
│   │   │   ├── ingestion/        # Source connectors
│   │   │   ├── scoring/          # Scoring engine
│   │   │   ├── db/
│   │   │   │   ├── schema.ts     # Drizzle schema
│   │   │   │   └── migrations/   # Drizzle migrations
│   │   │   ├── queue/            # BullMQ job definitions
│   │   │   ├── middleware/       # Auth, rate limiting, logging
│   │   │   └── server.ts         # Fastify entry point
│   │   └── package.json
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── pages/            # Dashboard, Runs, Sources, Settings, etc.
│   │   │   ├── components/       # Charts, cards, tables, layout
│   │   │   ├── api/              # API client
│   │   │   └── App.tsx
│   │   ├── vite.config.ts        # base: '/shieldtest/'
│   │   └── package.json
│   ├── probe/
│   │   ├── src/
│   │   │   ├── dns.ts            # DNS resolution checks
│   │   │   ├── http.ts           # HEAD/reachability checks
│   │   │   ├── worker.ts         # Job polling + execution
│   │   │   └── index.ts          # Entry point
│   │   └── package.json
│   └── shared/
│       ├── types.ts              # Verdict enums, API types
│       └── package.json
├── config/
│   ├── nginx.conf                # Production NGINX config
│   └── ecosystem.config.js       # PM2 config
├── docker-compose.yml            # Optional: local dev with PG + Redis
├── .env.example
├── package.json                  # Root workspace
└── tsconfig.base.json
```

## Security & Isolation

### Server-level

- Dedicated `shieldtest` Linux user (unprivileged)
- Dedicated PostgreSQL database and DB user, no superuser privileges
- PM2 runs under `shieldtest` user
- NGINX scoped to `/shieldtest/` path only
- App reads/writes only within its own directory

### Application-level

- No outbound browsing — only DNS lookups and HEAD requests with strict timeouts
- No shell execution — all checks use Node.js libraries
- Rate limiting on API endpoints
- Drizzle ORM only, parameterised queries, no raw SQL
- All API inputs validated with JSON schema
- CORS locked to same-origin
- Session-based auth on every route except health
- CSP headers via NGINX

### Probe safety

- Token-authenticated communication
- Receives domain lists only, nothing executable
- No payload downloads, no page body fetching
- Timeout caps per check (5s) and per job (5 min)

### Explicit prohibitions

- No JavaScript execution from target sites
- No malware payload downloads
- No adult content rendering/preview
- No full page body storage or screenshots
- No running as root or with elevated privileges
- No access to other databases, apps, or server files

## Database Schema

All tables use UUID primary keys and timestamps.

### `users`
- id, username, password_hash, created_at, updated_at
- Single role — all authenticated users have full access
- Initial user created via seed script

### `sessions`
- id, user_id, token_hash, expires_at, created_at

### `sources`
- id, name, type (threat/clean/category), url, enabled, refresh_interval_mins, last_synced_at, created_at

### `source_sync_runs`
- id, source_id, status (running/completed/failed), records_fetched, records_added, records_skipped, errors_json, started_at, completed_at

### `indicators`
- id, source_id, hostname, registrable_domain, full_url (nullable), category (malware/phishing/adult/ads/tracker/clean), confidence (0-100), first_seen_at, last_seen_at, is_active, created_at
- Unique constraint on (hostname, source_id)

### `benchmark_profiles`
- id, name, description, sample_size_per_category, recency_window_days, min_confidence, sampling_mode (balanced/weighted), created_by, created_at

### `benchmark_runs`
- id, profile_id, probe_id, status (pending/running/completed/failed), router_name, firmware_version, resolver_mode, notes, total_items, started_at, completed_at, created_by

### `benchmark_run_items`
- id, run_id, indicator_id, hostname, category, verdict, latency_ms, evidence_json, tested_at

### `probe_agents`
- id, name, token_hash, last_heartbeat_at, ip_address, status (online/offline), concurrency_limit, timeout_ms, created_at

### `scorecards`
- id, run_id, malware_block_rate, phishing_block_rate, adult_filter_rate, ads_tracker_block_rate, clean_allow_rate, consistency_score, latency_penalty, overall_score, created_at

### `app_settings`
- key (string PK), value_json, updated_at

### `audit_logs`
- id, user_id, action, entity_type, entity_id, details_json, created_at

### Indexes
- indicators(hostname), indicators(category, is_active)
- benchmark_run_items(run_id)
- benchmark_runs(status)
- probe_agents(token_hash)

## Verdict Model

Standardised enum values:

- `ALLOWED`
- `BLOCKED_NXDOMAIN`
- `BLOCKED_SINKHOLE`
- `BLOCKED_BLOCKPAGE`
- `TIMEOUT`
- `DNS_ERROR`
- `TLS_ERROR`
- `NETWORK_ERROR`
- `UNKNOWN`

Raw probe evidence stored separately in `evidence_json`.

## API Design

All routes under `/shieldtest/api/`. All require session auth except health and probe token endpoints.

### Public
- `GET /health` — status + DB/Redis connectivity
- `POST /auth/login` — username + password, returns session cookie
- `POST /auth/logout` — clears session

### Sources & Ingestion
- `GET /sources` — list sources with sync status
- `POST /sources/:id/sync` — trigger manual sync
- `GET /sources/sync-runs` — sync history
- `PUT /sources/:id` — enable/disable, update refresh interval

### Indicators
- `GET /indicators` — paginated, filterable by category/source/hostname
- `GET /indicators/stats` — counts per category

### Benchmark Profiles
- `GET /benchmark-profiles` — list profiles
- `POST /benchmark-profiles` — create profile
- `PUT /benchmark-profiles/:id` — update profile
- `POST /benchmark-profiles/:id/build` — build sample set

### Benchmark Runs
- `GET /runs` — list runs
- `POST /runs` — create and start run
- `GET /runs/:id` — run detail
- `GET /runs/:id/results` — paginated results
- `GET /runs/:id/score` — scorecard

### Probe Agents (token auth)
- `GET /probes` — list probes (session auth)
- `POST /probes/register` — register probe (session auth)
- `POST /probes/:id/heartbeat` — probe check-in (token auth)
- `GET /probes/:id/jobs` — probe polls for work (token auth)
- `POST /probes/:id/results` — probe submits results (token auth)

### Reports
- `GET /reports/:runId.csv` — CSV export
- `GET /reports/:runId.json` — JSON export

### Settings
- `GET /settings` — scoring weights and config
- `PUT /settings` — update settings

### Dashboard
- `GET /dashboard/overview` — overall score, trends
- `GET /dashboard/category/:category` — category detail

## Frontend Design

Cloudflare Radar inspired: dark background (#1a1a2e), blue/orange accents, clean sans-serif typography, data-dense cards.

### Layout
- Collapsible sidebar: Dashboard, Sources, Benchmark Profiles, Runs, Probes, Settings
- Top bar: "ShieldTest" branding, user menu (logout)
- Responsive grid content area

### Pages

**Dashboard** — overall score gauge, trend line chart, category pass rates bar chart, latest run card, quick stats

**Sources** — table with sync status, per-source sync button, sync history, warning badges

**Benchmark Profiles** — list with create/edit, build sample set with category count preview

**Runs** — table with status badges (pending/running/completed/failed), create run form

**Run Detail** — scorecard, verdict donut chart, category breakdown bars, filterable results table, CSV/JSON export

**Category Detail** — filtered results view, block rate trend over runs

**Probes** — list with heartbeat status indicators, register new probe

**Settings** — scoring weight inputs, latency penalty cap, save button

## Scoring Engine

### Formula (configurable)

```
Overall Score =
  0.35 × Malware Block Rate
+ 0.25 × Phishing Block Rate
+ 0.15 × Adult Filter Rate
+ 0.10 × Ads/Tracker Block Rate
+ 0.10 × Clean Allow Rate
+ 0.05 × Consistency Score
- Latency Penalty
```

### Calculations

- **Block Rate** = blocked items / (total items − infrastructure failures) per category
- **Clean Allow Rate** = allowed clean items / total clean items (= 1 − False Positive Rate)
- **Consistency Score** = stability vs previous run (within 5% delta = 1.0). First run = 1.0
- **Latency Penalty** = applied if average DNS latency > 200ms. Capped at 0.05

### Output
- Rates as decimals (0.0–1.0), overall score as 0–100
- Letter grade: A (90–100), B (75–89), C (60–74), D (40–59), F (0–39)
- Weights editable in Settings, changes apply to future runs
- Recalculate button available for past runs

## Ingestion Pipeline

### Source Connectors

| Source | Category | Format | Refresh |
|--------|----------|--------|---------|
| URLhaus | malware | CSV | 6 hours |
| OpenPhish | phishing | plain text URLs | 6 hours |
| PhishTank | phishing | JSON | 12 hours |
| Tranco | clean | CSV (top 10K) | weekly |
| StevenBlack | adult/ads/tracker | hosts file | weekly |

### Flow
1. BullMQ scheduled job triggers per source
2. Connector fetches raw data
3. Parser extracts and normalises hostnames (lowercase, strip www, extract registrable domain via `tldts`)
4. Upsert on (hostname, source_id), update last_seen_at
5. Unparseable records quarantined in sync run errors
6. Sync run stats recorded

### Confidence
- URLhaus: 85, OpenPhish: 75, PhishTank: 80
- Tranco top 1K: 95, top 10K: 85
- StevenBlack: 70

## Probe Agent

Lightweight Node.js script for any device on the test network.

### Flow
1. Register probe via web UI, receive token
2. Configure `.env` on probe device (server URL + token)
3. Polling loop: `GET /probes/:id/jobs` every few seconds
4. Execute per domain: DNS lookup → optional HEAD request → classify verdict
5. Submit batch results: `POST /probes/:id/results`
6. Heartbeat every 30 seconds

### Sinkhole detection
Known sinkhole IPs: 0.0.0.0, 127.0.0.1, common vendor ranges.

### Block page detection
HEAD returns 200 but suspicious content-length or known block page server headers.

### Constraints
- Concurrency: 5 concurrent checks (configurable)
- Per-check timeout: 5 seconds
- Per-job timeout: 5 minutes
- No shell commands, no file downloads, no script execution

## Deployment

### NGINX (within existing my6.my server block)

```nginx
location /shieldtest/ {
    alias /opt/shieldtest/packages/frontend/dist/;
    try_files $uri $uri/ /shieldtest/index.html;
    gzip_static on;
    expires 7d;
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

add_header X-Content-Type-Options nosniff;
add_header X-Frame-Options DENY;
add_header Referrer-Policy strict-origin-when-cross-origin;
```

### PM2

```js
module.exports = {
  apps: [{
    name: 'shieldtest',
    script: 'packages/backend/dist/server.js',
    user: 'shieldtest',
    instances: 1,
    max_memory_restart: '512M',
    env: { NODE_ENV: 'production' }
  }]
}
```

### Setup steps
1. Install PostgreSQL 16, create `shieldtest` database and user
2. Create `shieldtest` Linux user
3. Add 2 GB swap
4. Clone repo to `/opt/shieldtest/`
5. Install PM2 globally
6. Build frontend, run migrations, seed initial user
7. Start via PM2
8. Add NGINX config, reload

### Observability
- Structured JSON logs via pino
- Request logging with response times
- BullMQ job logs
- Health endpoint (DB + Redis check)
- PM2 crash restart and log rotation
- Nightly `pg_dump` cron for backups

## Demo Mode

- Seed script populates sample indicators across all categories
- Creates a few completed benchmark runs with realistic results
- Fake probe result generator for demonstration
- Dashboard works immediately after setup

## Assumptions and Trade-offs

1. Node.js 20 LTS used instead of 22 (already installed, supported until April 2026)
2. No Docker in production (server too constrained at 4 GB RAM)
3. Single user role — all authenticated users have full access
4. Google Safe Browsing / Web Risk deferred (requires API keys and compliance review)
5. Cloudflare Radar enrichment deferred (nice-to-have, not critical for v1)
6. PhishTank requires free API key — documented in setup
7. No multi-tenant, SSO, or advanced RBAC in v1
8. Backend port 3847 (arbitrary, configurable via env)
