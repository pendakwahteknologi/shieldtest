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

- **Runtime:** Node.js 20 LTS (plan migration to Node.js 22 LTS before April 2026 EOL)
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
- Rate limiting: 60 requests/minute per IP on auth endpoints, 120 requests/minute per session on API endpoints
- Drizzle ORM only, parameterised queries, no raw SQL
- All API inputs validated with JSON schema
- CORS locked to same-origin
- Session-based auth on every route except health
- Login brute-force protection: 5 failed attempts per username within 15 minutes triggers a 15-minute lockout
- CSRF protection: `SameSite=Strict` on session cookies prevents cross-origin request forgery. No additional CSRF token needed (modern browser support is sufficient for an internal tool).
- CSP headers via NGINX (see Deployment section), applied inside each location block to ensure NGINX applies them correctly

### Session management

- Session token delivered as `HttpOnly`, `Secure`, `SameSite=Strict` cookie
- Session expiry: 24 hours
- Token is a 256-bit random value; only the SHA-256 hash is stored in the database

### Probe safety

- Token-authenticated communication via `Authorization: Bearer <token>` header
- Receives domain lists only, nothing executable
- No payload downloads, no page body fetching
- Timeout caps per check (5s) and per job (5 min)
- Probe tokens can be revoked by deleting the probe from the UI; a new token is issued on re-registration
- **IP exposure risk:** the probe device's IP is visible to target domains during HEAD requests. The probe should run on a device without sensitive services. DNS-only mode (no HEAD requests) is available as a configuration option to minimise exposure.

### Explicit prohibitions

- No JavaScript execution from target sites
- No malware payload downloads
- No adult content rendering/preview
- No full page body storage or screenshots
- No running as root or with elevated privileges
- No access to other databases, apps, or server files

### Audit logging

The following actions are logged to `audit_logs`:
- User login/logout
- Source sync triggered (manual)
- Source enabled/disabled
- Benchmark profile created/updated/deleted
- Benchmark run created
- Probe registered/deleted
- Settings updated

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
- Sources are pre-seeded (URLhaus, OpenPhish, PhishTank, Tranco, StevenBlack). No user-created sources in v1.

### `source_sync_runs`
- id, source_id, status (running/completed/failed), records_fetched, records_added, records_skipped, errors_json, started_at, completed_at

### `indicators`
- id, source_id, hostname, registrable_domain, full_url (nullable), category (malware/phishing/adult/ads/tracker/clean), confidence (0-100), first_seen_at, last_seen_at, is_active, created_at
- Unique constraint on (hostname, source_id)

### `benchmark_profiles`
- id, name, description, sample_size_per_category, recency_window_days, min_confidence, sampling_mode (balanced/weighted), created_by, created_at

### `benchmark_runs`
- id, profile_id, probe_id, status (pending/running/completed/failed), router_name, firmware_version, resolver_mode, notes, total_items, completed_items, started_at, completed_at, created_by
- `resolver_mode` is a free-text label describing the DNS resolver configuration being tested (e.g. "router default DNS", "DoH via Cloudflare", "Pi-hole + Unbound"). Informational only — does not affect test execution.

### `benchmark_run_items`
- id, run_id, indicator_id, hostname, category, verdict, latency_ms, evidence_json, tested_at
- `evidence_json` structure: `{ dns: { addresses: string[], rcode: string, duration_ms: number }, http?: { status_code: number, headers: Record<string, string>, duration_ms: number }, error?: string }`

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
- benchmark_run_items(run_id), benchmark_run_items(indicator_id)
- benchmark_runs(status)
- probe_agents(token_hash)
- audit_logs(created_at), audit_logs(entity_type, entity_id)
- source_sync_runs(source_id, started_at)

### Foreign keys and cascades

- `source_sync_runs.source_id` → `sources.id` (CASCADE delete — if a source is removed, its sync history goes too)
- `indicators.source_id` → `sources.id` (CASCADE delete)
- `benchmark_runs.profile_id` → `benchmark_profiles.id` (RESTRICT — cannot delete a profile with runs)
- `benchmark_runs.probe_id` → `probe_agents.id` (SET NULL — probe deletion does not delete run history)
- `benchmark_run_items.run_id` → `benchmark_runs.id` (CASCADE delete)
- `scorecards.run_id` → `benchmark_runs.id` (CASCADE delete)
- `sessions.user_id` → `users.id` (CASCADE delete)
- `audit_logs.user_id` → `users.id` (SET NULL — preserve audit trail if user deleted)

### `errors_json` structure (source_sync_runs)

```json
[{ "line": 42, "raw": "malformed-entry", "reason": "Could not extract hostname" }]
```

### Data retention

- Indicators: stale indicators (not seen in 90 days) are marked `is_active = false` during sync. A weekly BullMQ job purges indicators inactive for >180 days.
- Old runs: no automatic deletion. Admin can delete runs manually via the API. Storage estimate: ~1 KB per `benchmark_run_item`, so a 5,000-item run ≈ 5 MB. At one run per week, roughly 250 MB/year — manageable on 48 GB disk.
- Audit logs: retained indefinitely. Minimal size impact.
- Sync runs: retained for 90 days, then purged by a weekly job.

### Migrations

Schema migrations are managed by Drizzle Kit. On upgrades: pull new code, run `npx drizzle-kit migrate`, restart PM2. Single-instance deployment means a brief downtime during restart (acceptable for an internal tool).

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

### Conventions

**Error response format:**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Human-readable description" } }
```

Standard HTTP status codes: 400 (validation), 401 (unauthenticated), 403 (forbidden), 404 (not found), 429 (rate limited), 500 (internal).

**Pagination:** Offset-based. Query parameters: `page` (default 1), `limit` (default 50, max 200). Response includes: `{ data: T[], pagination: { page, limit, total, totalPages } }`.

### Public
- `GET /health` — status + DB/Redis connectivity
- `POST /auth/login` — username + password, returns session cookie
- `POST /auth/logout` — clears session

### Sources & Ingestion
- `GET /sources` — list sources with sync status
- `POST /sources/:id/sync` — trigger manual sync
- `GET /sources/sync-runs` — sync history (paginated)
- `PUT /sources/:id` — enable/disable, update refresh interval

### Indicators
- `GET /indicators` — paginated, filterable by category/source/hostname
- `GET /indicators/stats` — counts per category

### Benchmark Profiles
- `GET /benchmark-profiles` — list profiles
- `POST /benchmark-profiles` — create profile
- `PUT /benchmark-profiles/:id` — update profile
- `GET /benchmark-profiles/:id` — get single profile detail
- `DELETE /benchmark-profiles/:id` — delete profile (only if no runs reference it)
- `GET /benchmark-profiles/:id/preview` — preview sample counts per category without creating anything (dry run of the sampling logic)

### Benchmark Runs
- `GET /runs` — list runs (paginated)
- `POST /runs` — create and start run. Accepts: profile_id, probe_id, router_name, firmware_version, resolver_mode, notes. Internally samples indicators from the profile, creates `benchmark_run_items`, and dispatches work to the probe. This is the single entry point for starting a benchmark.
- `GET /runs/:id` — run detail with metadata
- `GET /runs/:id/results` — paginated results with verdict breakdown
- `GET /runs/:id/score` — scorecard
- `DELETE /runs/:id` — delete run and associated items/scorecard

### Run progress
Frontend polls `GET /runs/:id` every 5 seconds while status is `running`. The `completed_items` / `total_items` fields provide progress percentage. SSE/WebSocket deferred to v2.

### Probe Agents (token auth)
- `GET /probes` — list probes (session auth)
- `POST /probes/register` — register probe, returns `{ probe_id, token }` once (session auth). Probe must store both.
- `DELETE /probes/:id` — delete probe, revokes token (session auth)
- `POST /probes/:id/heartbeat` — probe check-in (token auth; backend validates token belongs to `:id`)
- `GET /probes/:id/jobs` — probe polls for pending work (token auth; backend validates token belongs to `:id`). Returns: `{ job_id: string, run_id: string, items: [{ item_id: string, hostname: string, category: string }], config: { timeout_ms: number, do_http_check: boolean } }`. Max 50 items per batch. Returns empty `{ items: [] }` when no work is available.
- `POST /probes/:id/results` — probe submits results (token auth; backend validates token belongs to `:id`). Payload: `{ job_id: string, results: [{ item_id: string, verdict: Verdict, latency_ms: number, evidence: EvidenceJson }] }`

### Probe job lifecycle

When `POST /runs` creates a run, the backend splits `benchmark_run_items` into batches (50 items each) and enqueues them as jobs in BullMQ. When the probe polls `/jobs`, a job is dequeued and assigned to that probe. If the probe does not submit results within 5 minutes, the job is re-enqueued for retry (max 2 retries). After all retries are exhausted, remaining items are marked with verdict `NETWORK_ERROR`. When all items for a run are resolved, the run status transitions to `completed` and the scorecard is calculated.

### Reports
- `GET /reports/:runId.csv` — CSV export
- `GET /reports/:runId.json` — JSON export

### Settings
- `GET /settings` — scoring weights and config
- `PUT /settings` — update settings

### Dashboard
- `GET /dashboard/overview` — overall score, latest run summary, trend data (derived from last 20 scorecards)
- `GET /dashboard/category/:category` — category-specific block rate trend over runs

## Frontend Design

Cloudflare Radar inspired: dark background (#1a1a2e), blue/orange accents, clean sans-serif typography, data-dense cards.

### Layout
- Collapsible sidebar: Dashboard, Sources, Benchmark Profiles, Runs, Probes, Settings
- Top bar: "ShieldTest" branding, user menu (logout)
- Responsive grid content area

### Pages

**Dashboard** — overall score gauge, trend line chart, category pass rates bar chart, latest run card, quick stats

**Sources** — table with sync status, per-source sync button, sync history, warning badges

**Benchmark Profiles** — list with create/edit/delete, build sample set with category count preview

**Runs** — table with status badges (pending/running/completed/failed), create run form, progress bar for running jobs

**Run Detail** — scorecard, verdict donut chart, category breakdown bars, filterable results table, CSV/JSON export

**Category Detail** — reached by clicking category bars on Dashboard or Run Detail. Filtered results view, block rate trend over runs. Not a sidebar item — navigated to contextually.

**Probes** — list with heartbeat status indicators, register new probe (token shown once), delete probe

**Settings** — scoring weight inputs, latency penalty cap, save button

## Scoring Engine

### Formula (configurable)

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

Result is clamped to 0–100.

### Calculations

- **Block Rate** = blocked items / (total items − infrastructure failures) per category. "Blocked" means any `BLOCKED_*` verdict.
- **Clean Allow Rate** = allowed clean items / total clean items (= 1 − False Positive Rate)
- **Consistency Score** = average across categories of `1.0 − min(abs(this_rate − prev_rate) / 0.05, 1.0)`. If a category's rate changed by ≤5%, it contributes 1.0; changes beyond 5% reduce linearly to 0.0 at ≥10% delta. First run = 1.0.
- **Latency Penalty** = `min(max(avg_latency_ms − 200, 0) / 800, 1.0) × 5.0`. Kicks in above 200ms, scales linearly, caps at 5.0 points on the 0–100 scale (reached at 1000ms+). Applied after the ×100 multiplication.

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
1. BullMQ scheduled job triggers per source based on `refresh_interval_mins`
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
2. Configure `.env` on probe device (server URL, probe ID, and token)
3. Polling loop: `GET /probes/:id/jobs` every 3 seconds when idle
4. Execute per domain: DNS lookup → optional HEAD request → classify verdict
5. Submit batch results: `POST /probes/:id/results`
6. Heartbeat every 30 seconds

### Sinkhole detection
Known sinkhole IPs maintained in a configurable list, seeded with:
- `0.0.0.0`, `127.0.0.1`, `::1`
- `146.112.61.104`, `146.112.61.105` (OpenDNS)
- `185.228.168.10`, `185.228.169.11` (CleanBrowsing)
- `0.0.0.1` (pfSense/pfBlockerNG)

List is stored in the probe's config and can be extended.

### Block page detection
Two-stage heuristic:
1. **IP comparison:** if the resolved IP matches a known block page IP configured per-probe (e.g. the router's LAN IP like `192.168.1.1`), flag as `BLOCKED_BLOCKPAGE`.
2. **HTTP fingerprint:** if HEAD returns HTTP 200 but `content-length` < 512 bytes AND the response contains a `Location` redirect to a known block page path (e.g. `/blocked`, `/filter`), or the `server` header matches a configured block page signature (e.g. `FortiGuard`, `Sophos`, `pfSense`), flag as `BLOCKED_BLOCKPAGE`.

Block page signatures are configurable in the probe's `.env` file. If the HEAD response omits `content-length`, the HTTP fingerprint check is skipped and only the IP comparison stage applies. This is a best-effort heuristic — results flagged as `BLOCKED_BLOCKPAGE` should be reviewed. Items that don't match any heuristic remain `ALLOWED`.

### Constraints
- Concurrency: 5 concurrent checks (configurable)
- Per-check timeout: 5 seconds
- Per-job timeout: 5 minutes
- No shell commands, no file downloads, no script execution
- DNS-only mode available (skip HTTP HEAD checks entirely)

## Deployment

### TLS

HTTPS is assumed to be handled by the existing NGINX server block for `my6.my` (TLS certificate already in place). The ShieldTest location blocks inherit the parent server's TLS configuration.

### NGINX (within existing my6.my server block)

```nginx
# Shared security headers snippet (include in each ShieldTest location)
# In practice, place these in a shared snippet file and use `include`
# Shown inline here for clarity:
#   add_header X-Content-Type-Options nosniff always;
#   add_header X-Frame-Options DENY always;
#   add_header Referrer-Policy strict-origin-when-cross-origin always;
#   add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'" always;

# ShieldTest frontend — hashed assets cached aggressively
location /shieldtest/assets/ {
    alias /opt/shieldtest/packages/frontend/dist/assets/;
    gzip_static on;
    expires 1y;
    add_header Cache-Control "public, immutable";
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'" always;
}

# ShieldTest frontend — index.html and SPA fallback (no-cache)
# Note: using root + rewrite instead of alias to avoid try_files/alias pitfall
location /shieldtest/ {
    root /opt/shieldtest/packages/frontend/dist;
    rewrite ^/shieldtest/(.*)$ /$1 break;
    try_files $uri $uri/ /index.html;
    add_header Cache-Control "no-cache";
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'" always;
}

# ShieldTest API (CSP omitted intentionally — API returns JSON, not HTML)
location /shieldtest/api/ {
    proxy_pass http://127.0.0.1:3847/shieldtest/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 2m;
    proxy_read_timeout 60s;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
}
```

### PostgreSQL tuning (for 4 GB server)

```
shared_buffers = 256MB
work_mem = 4MB
maintenance_work_mem = 64MB
effective_cache_size = 1GB
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
1. Install PostgreSQL 16, create `shieldtest` database and user, apply tuning
2. Create `shieldtest` Linux user
3. Add 2 GB swap
4. Clone repo to `/opt/shieldtest/`
5. Install PM2 globally
6. Build frontend, run migrations, seed initial user and sources
7. Start via PM2
8. Add NGINX config, reload

### Upgrade steps
1. Pull new code
2. `npm install && npm run build`
3. `npx drizzle-kit migrate`
4. `pm2 restart shieldtest`

Brief downtime during restart is acceptable for an internal tool.

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

1. Node.js 20 LTS used initially; migration to Node.js 22 LTS planned before April 2026 EOL
2. No Docker in production (server too constrained at 4 GB RAM)
3. Single user role — all authenticated users have full access
4. Google Safe Browsing / Web Risk deferred (requires API keys and compliance review)
5. Cloudflare Radar enrichment deferred (nice-to-have, not critical for v1)
6. PhishTank requires free API key — documented in setup
7. No multi-tenant, SSO, or advanced RBAC in v1
8. Backend port 3847 (arbitrary, configurable via env)
9. Sources are pre-seeded, not user-creatable in v1
10. Run progress via polling (SSE/WebSocket deferred to v2)
11. No DELETE endpoints for sources or indicators (managed via enable/disable and sync lifecycle)
