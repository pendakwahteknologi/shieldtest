# Build Instructions for `my6.my/shieldtest`

## Purpose

Build a production-ready web application called **ShieldTest** under the path **`https://my6.my/shieldtest`**.

ShieldTest is a **DNS and web filtering benchmark platform** used to measure the effectiveness of router security features such as:

- malicious domain blocking
- phishing blocking
- adult content filtering
- ads and tracker blocking
- false positive avoidance on clean domains

The app must be designed for **defensive security testing** and **safe benchmarking only**.

Do **not** build a tool that encourages browsing harmful sites. The platform must use controlled checks and safety limits.

---

## High-Level Outcome

I want a full-stack application that:

1. ingests public threat intelligence and category datasets
2. normalizes them into benchmark test cases
3. runs safe network checks through a local probe or agent behind the router being tested
4. stores results and scoring history
5. shows dashboards, drilldowns, and benchmark reports
6. can be deployed cleanly behind NGINX under the subpath `/shieldtest`
7. App is in full UK english spelling. 

---

## Required Stack

Use the same general stack and deployment style as our existing internal web apps where practical.

### Frontend

- React 18
- Vite
- TypeScript
- Tailwind CSS
- React Router
- Recharts for charts

### Backend

- Node.js 22 LTS
- Fastify
- TypeScript
- Drizzle ORM

### Database

- PostgreSQL 14+

### Web Server / Deployment

- NGINX reverse proxy
- same-origin deployment behind `my6.my`
- health endpoint
- PM2 or systemd friendly process startup

### Optional but Recommended

- Redis for queueing and caching
- BullMQ or equivalent job queue
- Docker Compose for local development

---

## Critical Deployment Constraint

This app will live at:

- **Frontend base path:** `/shieldtest/`
- **Backend API path:** `/shieldtest/api/`

You must configure the app correctly for **subpath hosting**.

### Frontend requirements for subpath hosting

- Vite `base` must be set to `/shieldtest/`
- React Router must use `basename="/shieldtest"`
- all assets, links, navigation, and API calls must work when not deployed at `/`
- direct refresh on nested routes must work through NGINX fallback

### Backend requirements for subpath hosting

- API should be served behind `/shieldtest/api/`
- provide a health route at `/shieldtest/api/health`
- all docs and examples must assume subpath deployment

---

## Safety Requirements

This is very important.

The app must benchmark filtering **without becoming a risky browsing tool**.

### Required safety controls

- Never render, screenshot, or preview live malicious pages
- Never execute JavaScript from known malicious or phishing targets
- Never download payloads from malware URLs
- Never show explicit adult thumbnails or page previews
- Never encourage manual clicking of harmful domains
- Use **DNS checks**, **HTTP HEAD**, **TLS handshake checks**, and **strictly limited metadata fetches** where appropriate
- Allow category testing mostly at the **domain / hostname level**
- Run risky checks only from a clearly isolated local probe agent
- Add rate limiting, timeout limits, and sampling controls
- Log only the minimum evidence needed for benchmarking

### Safe handling guidance by category

#### Malware / phishing

- Prefer DNS resolution checks first
- Allow only optional HEAD request or lightweight reachability check
- No full browser rendering
- No file downloads
- No script execution

#### Adult content filtering

- Test at domain categorization level only
- No thumbnails
- No screenshots
- No page body previews
- Domain and category metadata should be enough

#### Ads / trackers

- Use known hostname lists or DNS-level checks
- No need to render ad pages

---

## Public Data Sources to Support

Design ingestion connectors for the following public sources.

### Threat and phishing sources

1. **URLhaus**
   - use for malware distribution URLs and hostnames
   - prefer hostname extraction for DNS benchmark datasets
   - support feed refresh and deduplication

2. **OpenPhish**
   - use for phishing URLs
   - support community feed ingestion

3. **PhishTank**
   - use as an additional phishing validation source
   - support lookups or import workflows where practical

### Clean baseline sources

4. **Tranco**
   - use as the clean-domain baseline for false positive testing
   - sample from stable popular domains

5. **Cloudflare Radar**
   - optional enrichment for domain popularity or categorization
   - useful for popularity weighting and sanity checking

### Category / adult filter sources

6. **StevenBlack hosts extensions**
   - support optional curated category datasets such as porn and related extensions where appropriate for defensive testing

### Optional reputation service integration

7. **Google Safe Browsing** for non-commercial use only
8. **Google Web Risk** for commercial or revenue-generating use cases

If a source has licensing or usage restrictions, surface them clearly in the admin UI and docs.

---

## Product Scope

Build the app with these modules.

### 1. Dataset Ingestion Module

Features:

- scheduled import jobs
- manual refresh button
- source status page
- deduplication and canonicalization
- extract registrable domain, hostname, URL, category, source name, first seen, last seen, confidence
- mark records as `malware`, `phishing`, `adult`, `ads`, `tracker`, `clean`
- quarantine malformed or suspicious records during import

### 2. Benchmark Dataset Builder

Features:

- create benchmark runs from selected sources
- choose sample size per category
- support balanced sampling and weighted sampling
- configurable recency window
- configurable confidence threshold
- exclude duplicates and overlapping domains across categories
- build a clean false-positive control set

### 3. Local Probe Agent

This is a key component.

Build a small agent that runs inside the LAN behind the router under test.

Responsibilities:

- receive test jobs from the ShieldTest backend
- run DNS lookups through the router path being tested
- optionally test A, AAAA, CNAME, and HTTPS reachability
- capture outcomes such as:
  - resolved normally
  - NXDOMAIN
  - blocked / sinkholed
  - timeout
  - redirected to block page
  - TLS failure
- submit results back to the backend securely

Requirements:

- lightweight and easy to run
- provide Linux-first support
- support Docker deployment
- support agent token authentication
- store minimal local state
- allow concurrency limits and timeout configuration

### 4. Benchmark Runner

Features:

- create run jobs
- dispatch samples to one or more probe agents
- track status in real time
- retry transient failures
- separate infrastructure failures from filter verdicts
- store run metadata such as router name, firmware version, resolver mode, date, and notes

### 5. Results and Scoring Engine

Scoring dimensions should include:

- malware blocking rate
- phishing blocking rate
- adult filtering rate
- ads / tracker blocking rate
- false positive rate on clean domains
- consistency across repeated runs
- DNS latency impact

Provide:

- raw results
- normalized verdicts
- confidence-aware scoring
- category-by-category scorecards
- overall benchmark score

### 6. Dashboard and Reporting

Required views:

#### Overview dashboard

- overall score
- most recent run
- score trend over time
- pass / fail summary by category

#### Category detail pages

- malware
- phishing
- adult
- ads / trackers
- clean false positives

#### Run detail page

- probe used
- resolver path
- sample counts
- verdict distribution
- outliers
- exportable results

#### Dataset admin page

- active sources
- last refresh
- record counts
- disabled feeds
- ingestion warnings

#### Reports

- export CSV
- export JSON
- printable PDF-friendly view

---

## Suggested Scoring Model

Implement this initial scoring formula and make it configurable in admin settings:

```text
Overall Score =
  0.35 * Malware Block Rate
+ 0.25 * Phishing Block Rate
+ 0.15 * Adult Filter Rate
+ 0.10 * Ads/Tracker Block Rate
+ 0.10 * Clean Allow Rate
+ 0.05 * Consistency Score
- Latency Penalty
```

Where:

- `Clean Allow Rate = 1 - False Positive Rate`
- `Latency Penalty` should be small and capped
- score weights must be editable in admin settings

Also provide a simpler scoring card for non-technical users.

---

## Verdict Model

Standardize verdicts into these enums:

- `ALLOWED`
- `BLOCKED_NXDOMAIN`
- `BLOCKED_SINKHOLE`
- `BLOCKED_BLOCKPAGE`
- `TIMEOUT`
- `DNS_ERROR`
- `TLS_ERROR`
- `NETWORK_ERROR`
- `UNKNOWN`

Keep the original raw probe evidence separately for debugging.

---

## Data Model

Please implement a clear schema with migrations.

Suggested tables:

- `sources`
- `source_sync_runs`
- `indicators`
- `indicator_categories`
- `benchmark_profiles`
- `benchmark_runs`
- `benchmark_run_items`
- `probe_agents`
- `probe_results`
- `scorecards`
- `app_settings`
- `audit_logs`

Suggested fields to include where relevant:

- UUID primary keys
- timestamps
- source name
- indicator type
- hostname
- registrable domain
- full URL if available
- category
- confidence
- first seen
- last seen
- freshness status
- run ID
- probe ID
- verdict
- latency
- evidence JSON

---

## Auth and Roles

Implement simple but production-ready auth.

Roles:

- `admin`
- `analyst`
- `viewer`

Permissions:

- admin can manage sources, runs, scores, and settings
- analyst can run benchmarks and inspect results
- viewer can only read dashboards and reports

---

## UI and UX Requirements

Design should be clean, technical, and professional.

### Required UX points

- responsive desktop-first layout
- dark mode support is optional but appreciated
- use charts for trends and distributions
- clearly distinguish blocked vs allowed vs infrastructure failure
- highlight false positives prominently
- make it obvious that the platform is for **safe benchmarking**

### Good UI ideas

- run comparison view
- source confidence badges
- benchmark profile templates
- filter by router, date, category, probe, and verdict

---

## API Requirements

Create a clean Fastify API under `/shieldtest/api`.

Suggested endpoints:

### Health

- `GET /shieldtest/api/health`

### Sources

- `GET /shieldtest/api/sources`
- `POST /shieldtest/api/sources/sync`
- `GET /shieldtest/api/sources/sync-runs`

### Indicators

- `GET /shieldtest/api/indicators`
- `POST /shieldtest/api/benchmark-profiles/:id/build`

### Runs

- `GET /shieldtest/api/runs`
- `POST /shieldtest/api/runs`
- `GET /shieldtest/api/runs/:id`
- `GET /shieldtest/api/runs/:id/results`
- `GET /shieldtest/api/runs/:id/score`

### Probe Agents

- `GET /shieldtest/api/probes`
- `POST /shieldtest/api/probes/register`
- `POST /shieldtest/api/probes/:id/heartbeat`
- `POST /shieldtest/api/probes/:id/results`

### Reports

- `GET /shieldtest/api/reports/:runId.csv`
- `GET /shieldtest/api/reports/:runId.json`

### Settings

- `GET /shieldtest/api/settings`
- `PUT /shieldtest/api/settings`

---

## NGINX Requirements

Please provide production-ready NGINX examples for deployment under `my6.my/shieldtest`.

The config must handle:

- frontend served under `/shieldtest/`
- API proxied under `/shieldtest/api/`
- SPA fallback for nested routes
- security headers
- gzip or brotli where appropriate
- cache headers for static assets
- reasonable body size and timeout settings

Include an example like this conceptually:

- `/shieldtest/` → frontend app
- `/shieldtest/api/` → Fastify backend

---

## Observability and Operations

Build in basic production observability.

### Required

- health endpoint
- structured logs
- request logging
- import job logs
- benchmark run logs
- probe heartbeat monitoring
- admin-visible sync errors

### Nice to have

- Prometheus metrics endpoint
- OpenTelemetry hooks
- Sentry integration

---

## Tests Required

Please include tests.

### Backend

- unit tests for score calculation
- unit tests for verdict normalization
- unit tests for dataset deduplication
- integration tests for key API routes

### Frontend

- component tests for dashboard widgets
- route tests for subpath deployment assumptions

### End-to-end

- smoke test for a benchmark run lifecycle
- test that `/shieldtest/` path works correctly

---

## Seed Data and Demo Mode

Provide a local demo mode with:

- seeded sample indicators
- a few completed benchmark runs
- a fake probe result generator
- a dashboard that works immediately after setup

This is important so the app can be evaluated quickly before connecting real feeds.

---

## Deliverables I Want

Please generate the following:

1. full project structure
2. backend implementation
3. frontend implementation
4. database schema and migrations
5. probe agent implementation
6. sample `.env.example` files
7. Docker Compose for development
8. NGINX production config for `my6.my/shieldtest`
9. README with local setup and production deployment
10. seeded demo data
11. tests
12. security notes and usage constraints

---

## Implementation Notes

Use practical defaults and do not overcomplicate the first version.

### Priorities for v1

- working ingestion pipeline
- benchmark profile creation
- local probe registration
- benchmark execution
- scoring and dashboard
- subpath deployment correctness

### Defer for later unless easy

- multi-tenant architecture
- SSO
- advanced RBAC
- distributed probe fleet orchestration
- heavy ML classification

---

## Acceptance Criteria

The project is done when:

1. it runs locally with one command or a short documented setup
2. the frontend works correctly under `/shieldtest/`
3. the API works correctly under `/shieldtest/api/`
4. a demo benchmark can be run end to end
5. results are visible in dashboard charts
6. CSV and JSON export work
7. health endpoint works
8. NGINX example works for subpath hosting
9. tests pass
10. README is clear enough for deployment by another engineer

---

## Output Format I Want From You

Please respond with:

1. a short architecture summary
2. the proposed folder structure
3. the full source code
4. database schema and migrations
5. environment variable examples
6. NGINX config
7. setup instructions
8. testing instructions
9. deployment instructions for `my6.my/shieldtest`
10. any assumptions or tradeoffs

If needed, break the response into multiple parts, but keep the code complete and consistent.

---

## Extra Guidance

Please be careful with these details:

- subpath routing bugs are not acceptable
- do not hardcode root-path assumptions
- do not build unsafe live browsing features for malicious or adult sites
- prefer hostname and DNS-based evidence where possible
- make the app operationally simple for a small team
- keep code readable and production-oriented

