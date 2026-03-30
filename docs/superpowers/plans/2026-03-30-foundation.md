# ShieldTest Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the project scaffold, database schema, auth system, and health endpoint so the app is deployable and testable before adding features.

**Architecture:** npm workspaces monorepo with `packages/backend`, `packages/frontend`, `packages/shared`, and `packages/probe`. Backend is Fastify + TypeScript + Drizzle ORM. Frontend is React 18 + Vite + Tailwind CSS. PostgreSQL database with Redis for sessions/queue. All served under `/shieldtest/` subpath.

**Tech Stack:** Node.js 20, TypeScript 5, Fastify 4, Drizzle ORM, React 18, Vite 5, Tailwind CSS 3, PostgreSQL 16, Redis 7, BullMQ, bcrypt, pino

**Spec:** `docs/superpowers/specs/2026-03-30-shieldtest-design.md`

**Sub-plans (to be written after this one):**
- Plan 2: Dataset Ingestion
- Plan 3: Benchmark Builder + Probe Agent
- Plan 4: Scoring + Dashboard
- Plan 5: Demo Mode + Polish

---

## File Structure

```
shieldtest/
├── package.json                          # Root workspace config
├── tsconfig.base.json                    # Shared TS config
├── .env.example                          # Environment variable template
├── .gitignore                            # Git ignore rules
├── config/
│   ├── nginx.conf                        # NGINX production config
│   └── ecosystem.config.js               # PM2 config
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── types.ts                  # Verdict enum, API types, role types
│   │       ├── constants.ts              # Shared constants (verdicts, categories)
│   │       └── index.ts                  # Re-exports
│   ├── backend/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts             # Drizzle Kit config
│   │   └── src/
│   │       ├── server.ts                 # Fastify entry point + plugin registration
│   │       ├── config.ts                 # Env var loading + validation
│   │       ├── db/
│   │       │   ├── index.ts              # DB connection pool
│   │       │   ├── schema.ts             # All Drizzle table definitions
│   │       │   └── migrate.ts            # Migration runner
│   │       ├── middleware/
│   │       │   ├── auth.ts               # Session auth middleware
│   │       │   └── rate-limit.ts         # Rate limiting config
│   │       ├── routes/
│   │       │   ├── health.ts             # GET /health
│   │       │   └── auth.ts              # POST /auth/login, /auth/logout
│   │       └── services/
│   │           └── auth.ts               # Password hashing, session management
│   ├── frontend/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.node.json
│   │   ├── vite.config.ts                # base: '/shieldtest/'
│   │   ├── tailwind.config.js
│   │   ├── postcss.config.js
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx                  # React entry point
│   │       ├── App.tsx                   # Router + layout shell
│   │       ├── api/
│   │       │   └── client.ts             # Fetch wrapper for /shieldtest/api/
│   │       ├── pages/
│   │       │   ├── Login.tsx             # Login page
│   │       │   └── Dashboard.tsx         # Placeholder dashboard
│   │       ├── components/
│   │       │   └── Layout.tsx            # Sidebar + topbar shell
│   │       └── index.css                 # Tailwind imports + dark theme
│   └── probe/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.ts                  # Placeholder entry point
```

---

### Task 1: Root Workspace + TypeScript Config

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Create root package.json with workspaces**

```json
{
  "name": "shieldtest",
  "private": true,
  "workspaces": [
    "packages/shared",
    "packages/backend",
    "packages/frontend",
    "packages/probe"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "dev:backend": "npm run dev -w packages/backend",
    "dev:frontend": "npm run dev -w packages/frontend",
    "db:migrate": "npm run migrate -w packages/backend",
    "db:generate": "npm run generate -w packages/backend",
    "create-user": "npm run create-user -w packages/backend"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
*.env
!.env.example
.DS_Store
*.log
```

- [ ] **Step 4: Create .env.example**

```bash
# Database
DATABASE_URL=postgresql://shieldtest:shieldtest@localhost:5432/shieldtest

# Redis
REDIS_URL=redis://localhost:6379

# Server
PORT=3847
NODE_ENV=development
SESSION_SECRET=change-me-to-a-random-64-char-string

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173
```

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.base.json .gitignore .env.example
git commit -m "feat: add root workspace config and TypeScript base"
```

---

### Task 2: Shared Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create shared package.json**

```json
{
  "name": "@shieldtest/shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create shared tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create types.ts**

```typescript
// Verdict enum — standardised probe result classifications
export const Verdict = {
  ALLOWED: 'ALLOWED',
  BLOCKED_NXDOMAIN: 'BLOCKED_NXDOMAIN',
  BLOCKED_SINKHOLE: 'BLOCKED_SINKHOLE',
  BLOCKED_BLOCKPAGE: 'BLOCKED_BLOCKPAGE',
  TIMEOUT: 'TIMEOUT',
  DNS_ERROR: 'DNS_ERROR',
  TLS_ERROR: 'TLS_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;

export type Verdict = (typeof Verdict)[keyof typeof Verdict];

// Indicator categories
export const IndicatorCategory = {
  MALWARE: 'malware',
  PHISHING: 'phishing',
  ADULT: 'adult',
  ADS: 'ads',
  TRACKER: 'tracker',
  CLEAN: 'clean',
} as const;

export type IndicatorCategory = (typeof IndicatorCategory)[keyof typeof IndicatorCategory];

// Source types
export const SourceType = {
  THREAT: 'threat',
  CLEAN: 'clean',
  CATEGORY: 'category',
} as const;

export type SourceType = (typeof SourceType)[keyof typeof SourceType];

// Benchmark run status
export const RunStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

// Sync run status
export const SyncStatus = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

// Probe status
export const ProbeStatus = {
  ONLINE: 'online',
  OFFLINE: 'offline',
} as const;

export type ProbeStatus = (typeof ProbeStatus)[keyof typeof ProbeStatus];

// Sampling mode
export const SamplingMode = {
  BALANCED: 'balanced',
  WEIGHTED: 'weighted',
} as const;

export type SamplingMode = (typeof SamplingMode)[keyof typeof SamplingMode];

// Evidence JSON structure from probe
export interface EvidenceJson {
  dns: {
    addresses: string[];
    rcode: string;
    duration_ms: number;
  };
  http?: {
    status_code: number;
    headers: Record<string, string>;
    duration_ms: number;
  };
  error?: string;
}

// API error response
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

// Pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Letter grade
export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';
```

- [ ] **Step 4: Create constants.ts**

```typescript
import type { LetterGrade } from './types.js';

export const API_BASE_PATH = '/shieldtest/api';

export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 50,
  maxLimit: 200,
} as const;

export const RATE_LIMITS = {
  auth: { max: 60, timeWindow: '1 minute' },
  api: { max: 120, timeWindow: '1 minute' },
} as const;

export const SESSION = {
  expiryHours: 24,
  cookieName: 'shieldtest_session',
} as const;

export const BRUTE_FORCE = {
  maxAttempts: 5,
  windowMinutes: 15,
  lockoutMinutes: 15,
} as const;

export function getLetterGrade(score: number): LetterGrade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}
```

- [ ] **Step 5: Create index.ts re-exports**

```typescript
export * from './types.js';
export * from './constants.js';
```

- [ ] **Step 6: Build shared package**

Run: `cd packages/shared && npx tsc`
Expected: Compiles without errors, creates `dist/` folder

- [ ] **Step 7: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared package with types, constants, and enums"
```

---

### Task 3: Backend Package Scaffold

**Files:**
- Create: `packages/backend/package.json`
- Create: `packages/backend/tsconfig.json`
- Create: `packages/backend/src/config.ts`
- Create: `packages/backend/src/server.ts`

- [ ] **Step 1: Create backend package.json**

```json
{
  "name": "@shieldtest/backend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/server.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "migrate": "drizzle-kit migrate",
    "generate": "drizzle-kit generate",
    "create-user": "tsx src/scripts/create-user.ts"
  },
  "dependencies": {
    "@shieldtest/shared": "*",
    "fastify": "^4.28.0",
    "@fastify/cookie": "^9.3.0",
    "@fastify/cors": "^9.0.0",
    "@fastify/rate-limit": "^9.1.0",
    "@fastify/static": "^7.0.0",
    "drizzle-orm": "^0.30.0",
    "postgres": "^3.4.0",
    "ioredis": "^5.4.0",
    "bullmq": "^5.7.0",
    "bcrypt": "^5.1.0",
    "pino": "^9.0.0",
    "pino-pretty": "^11.0.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "tsx": "^4.7.0",
    "drizzle-kit": "^0.21.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create backend tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" }
  ]
}
```

- [ ] **Step 3: Create config.ts**

```typescript
import { API_BASE_PATH } from '@shieldtest/shared';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3847', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: required('DATABASE_URL'),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  sessionSecret: required('SESSION_SECRET'),
  apiBasePath: API_BASE_PATH,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
} as const;
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [ ] **Step 5: Create server.ts**

```typescript
import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { RATE_LIMITS } from '@shieldtest/shared';

const app = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
    transport: config.nodeEnv !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
  },
});

// Plugins
await app.register(cors, {
  origin: config.nodeEnv === 'production'
    ? false // Same-origin in production
    : config.frontendUrl,
  credentials: true,
});

await app.register(cookie, {
  secret: config.sessionSecret,
});

// Global rate limit (API default)
await app.register(rateLimit, {
  max: RATE_LIMITS.api.max,
  timeWindow: RATE_LIMITS.api.timeWindow,
});

// Routes
await app.register(healthRoutes, { prefix: config.apiBasePath });
await app.register(authRoutes, { prefix: config.apiBasePath });

// Start
const start = async () => {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`ShieldTest backend listening on port ${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
```

- [ ] **Step 5: Commit**

```bash
git add packages/backend/package.json packages/backend/tsconfig.json packages/backend/src/config.ts packages/backend/src/server.ts
git commit -m "feat: add backend package scaffold with Fastify server"
```

---

### Task 4: Database Schema

**Files:**
- Create: `packages/backend/drizzle.config.ts`
- Create: `packages/backend/src/db/schema.ts`
- Create: `packages/backend/src/db/index.ts`
- Create: `packages/backend/src/db/migrate.ts`

- [ ] **Step 1: Create drizzle.config.ts**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 2: Create schema.ts with all tables**

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  real,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ── Users ──────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: varchar('username', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Sessions ───────────────────────────────────────────
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Sources ────────────────────────────────────────────
export const sources = pgTable('sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  type: varchar('type', { length: 20 }).notNull(), // threat, clean, category
  url: text('url').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  refreshIntervalMins: integer('refresh_interval_mins').default(360).notNull(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Source Sync Runs ───────────────────────────────────
export const sourceSyncRuns = pgTable('source_sync_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').notNull().references(() => sources.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull(), // running, completed, failed
  recordsFetched: integer('records_fetched').default(0).notNull(),
  recordsAdded: integer('records_added').default(0).notNull(),
  recordsSkipped: integer('records_skipped').default(0).notNull(),
  errorsJson: jsonb('errors_json').$type<Array<{ line: number; raw: string; reason: string }>>(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('idx_sync_runs_source_started').on(table.sourceId, table.startedAt),
]);

// ── Indicators ─────────────────────────────────────────
export const indicators = pgTable('indicators', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').notNull().references(() => sources.id, { onDelete: 'cascade' }),
  hostname: varchar('hostname', { length: 500 }).notNull(),
  registrableDomain: varchar('registrable_domain', { length: 500 }),
  fullUrl: text('full_url'),
  category: varchar('category', { length: 20 }).notNull(), // malware, phishing, adult, ads, tracker, clean
  confidence: integer('confidence').default(50).notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_indicators_hostname_source').on(table.hostname, table.sourceId),
  index('idx_indicators_hostname').on(table.hostname),
  index('idx_indicators_category_active').on(table.category, table.isActive),
]);

// ── Benchmark Profiles ─────────────────────────────────
export const benchmarkProfiles = pgTable('benchmark_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  sampleSizePerCategory: integer('sample_size_per_category').default(100).notNull(),
  recencyWindowDays: integer('recency_window_days').default(30).notNull(),
  minConfidence: integer('min_confidence').default(50).notNull(),
  samplingMode: varchar('sampling_mode', { length: 20 }).default('balanced').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Probe Agents ───────────────────────────────────────
export const probeAgents = pgTable('probe_agents', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  ipAddress: varchar('ip_address', { length: 45 }),
  status: varchar('status', { length: 20 }).default('offline').notNull(),
  concurrencyLimit: integer('concurrency_limit').default(5).notNull(),
  timeoutMs: integer('timeout_ms').default(5000).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_probe_agents_token').on(table.tokenHash),
]);

// ── Benchmark Runs ─────────────────────────────────────
export const benchmarkRuns = pgTable('benchmark_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  profileId: uuid('profile_id').notNull().references(() => benchmarkProfiles.id, { onDelete: 'restrict' }),
  probeId: uuid('probe_id').references(() => probeAgents.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  routerName: varchar('router_name', { length: 255 }),
  firmwareVersion: varchar('firmware_version', { length: 100 }),
  resolverMode: varchar('resolver_mode', { length: 255 }),
  notes: text('notes'),
  totalItems: integer('total_items').default(0).notNull(),
  completedItems: integer('completed_items').default(0).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_benchmark_runs_status').on(table.status),
]);

// ── Benchmark Run Items ────────────────────────────────
export const benchmarkRunItems = pgTable('benchmark_run_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').notNull().references(() => benchmarkRuns.id, { onDelete: 'cascade' }),
  indicatorId: uuid('indicator_id').references(() => indicators.id, { onDelete: 'set null' }),
  hostname: varchar('hostname', { length: 500 }).notNull(),
  category: varchar('category', { length: 20 }).notNull(),
  verdict: varchar('verdict', { length: 30 }),
  latencyMs: integer('latency_ms'),
  evidenceJson: jsonb('evidence_json'),
  testedAt: timestamp('tested_at', { withTimezone: true }),
}, (table) => [
  index('idx_run_items_run').on(table.runId),
  index('idx_run_items_indicator').on(table.indicatorId),
]);

// ── Scorecards ─────────────────────────────────────────
export const scorecards = pgTable('scorecards', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id').notNull().references(() => benchmarkRuns.id, { onDelete: 'cascade' }).unique(),
  malwareBlockRate: real('malware_block_rate'),
  phishingBlockRate: real('phishing_block_rate'),
  adultFilterRate: real('adult_filter_rate'),
  adsTrackerBlockRate: real('ads_tracker_block_rate'),
  cleanAllowRate: real('clean_allow_rate'),
  consistencyScore: real('consistency_score'),
  latencyPenalty: real('latency_penalty'),
  overallScore: real('overall_score'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── App Settings ───────────────────────────────────────
export const appSettings = pgTable('app_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  valueJson: jsonb('value_json').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Audit Logs ─────────────────────────────────────────
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }),
  entityId: uuid('entity_id'),
  detailsJson: jsonb('details_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_audit_logs_created').on(table.createdAt),
  index('idx_audit_logs_entity').on(table.entityType, table.entityId),
]);
```

- [ ] **Step 3: Create db/index.ts (connection pool)**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config.js';
import * as schema from './schema.js';

const client = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export { schema };
```

- [ ] **Step 4: Create db/migrate.ts**

```typescript
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './index.js';

async function runMigrations() {
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  console.log('Migrations complete.');
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

- [ ] **Step 5: Generate initial migration**

Run: `cd packages/backend && npx drizzle-kit generate`
Expected: Creates migration files in `src/db/migrations/`

- [ ] **Step 6: Run migration against database**

Run: `cd packages/backend && npx drizzle-kit migrate`
Expected: "Migrations complete." — tables created in PostgreSQL

- [ ] **Step 7: Commit**

```bash
git add packages/backend/drizzle.config.ts packages/backend/src/db/
git commit -m "feat: add database schema with all tables and migrations"
```

---

### Task 5: Auth Service

**Files:**
- Create: `packages/backend/src/services/auth.ts`
- Create: `packages/backend/src/middleware/auth.ts`
- Create: `packages/backend/src/routes/auth.ts`
- Create: `packages/backend/src/scripts/create-user.ts`

- [ ] **Step 1: Write failing test for password hashing**

Create `packages/backend/src/services/__tests__/auth.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  checkBruteForce,
  recordFailedAttempt,
  clearFailedAttempts,
} from '../auth.js';

describe('password hashing', () => {
  it('should hash and verify a password', async () => {
    const hash = await hashPassword('test-password-123');
    expect(hash).not.toBe('test-password-123');
    expect(await verifyPassword('test-password-123', hash)).toBe(true);
  });

  it('should reject wrong password', async () => {
    const hash = await hashPassword('correct-password');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});

describe('brute-force protection', () => {
  beforeEach(() => {
    clearFailedAttempts('testuser');
  });

  it('should not lock after fewer than 5 attempts', () => {
    for (let i = 0; i < 4; i++) {
      recordFailedAttempt('testuser');
    }
    expect(checkBruteForce('testuser').locked).toBe(false);
  });

  it('should lock after 5 failed attempts', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt('testuser');
    }
    expect(checkBruteForce('testuser').locked).toBe(true);
    expect(checkBruteForce('testuser').retryAfterMs).toBeGreaterThan(0);
  });

  it('should not affect other usernames', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt('testuser');
    }
    expect(checkBruteForce('otheruser').locked).toBe(false);
  });

  it('should unlock after clearing attempts', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt('testuser');
    }
    clearFailedAttempts('testuser');
    expect(checkBruteForce('testuser').locked).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/services/__tests__/auth.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create auth service**

```typescript
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { SESSION, BRUTE_FORCE } from '@shieldtest/shared';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string): Promise<string> {
  // Generate random token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + SESSION.expiryHours);

  await db.insert(schema.sessions).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return token;
}

export async function validateSession(token: string): Promise<string | null> {
  const tokenHash = hashToken(token);

  const [session] = await db
    .select({ userId: schema.sessions.userId, expiresAt: schema.sessions.expiresAt })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.tokenHash, tokenHash),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return session?.userId ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash));
}

export async function findUserByUsername(username: string) {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .limit(1);

  return user ?? null;
}

// Brute-force tracking (in-memory, resets on restart — acceptable for small team)
const failedAttempts = new Map<string, { count: number; firstAttempt: number }>();

export function checkBruteForce(username: string): { locked: boolean; retryAfterMs?: number } {
  const record = failedAttempts.get(username);
  if (!record) return { locked: false };

  const windowMs = BRUTE_FORCE.windowMinutes * 60 * 1000;
  const lockoutMs = BRUTE_FORCE.lockoutMinutes * 60 * 1000;
  const now = Date.now();

  // Window expired, reset
  if (now - record.firstAttempt > windowMs + lockoutMs) {
    failedAttempts.delete(username);
    return { locked: false };
  }

  if (record.count >= BRUTE_FORCE.maxAttempts) {
    const unlockAt = record.firstAttempt + windowMs + lockoutMs;
    if (now < unlockAt) {
      return { locked: true, retryAfterMs: unlockAt - now };
    }
    failedAttempts.delete(username);
    return { locked: false };
  }

  return { locked: false };
}

export function recordFailedAttempt(username: string): void {
  const record = failedAttempts.get(username);
  const now = Date.now();

  if (!record) {
    failedAttempts.set(username, { count: 1, firstAttempt: now });
  } else {
    record.count += 1;
  }
}

export function clearFailedAttempts(username: string): void {
  failedAttempts.delete(username);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/backend && npx vitest run src/services/__tests__/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Create auth middleware**

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { validateSession } from '../services/auth.js';
import { SESSION } from '@shieldtest/shared';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[SESSION.cookieName];

  if (!token) {
    reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } });
    return;
  }

  const userId = await validateSession(token);
  if (!userId) {
    reply.status(401).send({ error: { code: 'SESSION_EXPIRED', message: 'Session expired, please log in again' } });
    return;
  }

  request.userId = userId;
}
```

- [ ] **Step 6: Create auth routes**

```typescript
import { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {
  findUserByUsername,
  verifyPassword,
  createSession,
  deleteSession,
  checkBruteForce,
  recordFailedAttempt,
  clearFailedAttempts,
} from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { SESSION, RATE_LIMITS } from '@shieldtest/shared';

export async function authRoutes(app: FastifyInstance) {
  // Register stricter rate limit for auth sub-routes
  await app.register(rateLimit, {
    max: RATE_LIMITS.auth.max,
    timeWindow: RATE_LIMITS.auth.timeWindow,
  });

  app.post('/auth/login', async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string };

    if (!username || !password) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Username and password are required' },
      });
    }

    // Check brute force lockout
    const bruteCheck = checkBruteForce(username);
    if (bruteCheck.locked) {
      return reply.status(429).send({
        error: { code: 'ACCOUNT_LOCKED', message: 'Too many failed attempts. Please try again later.' },
      });
    }

    const user = await findUserByUsername(username);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      recordFailedAttempt(username);
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
      });
    }

    clearFailedAttempts(username);
    const token = await createSession(user.id);

    reply.setCookie(SESSION.cookieName, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/shieldtest',
      maxAge: SESSION.expiryHours * 60 * 60,
    });

    return { ok: true, username: user.username };
  });

  app.post('/auth/logout', { preHandler: [requireAuth] }, async (request, reply) => {
    const token = request.cookies[SESSION.cookieName];
    if (token) {
      await deleteSession(token);
    }

    reply.clearCookie(SESSION.cookieName, { path: '/shieldtest' });
    return { ok: true };
  });
}
```

- [ ] **Step 7: Create user creation script**

Create `packages/backend/src/scripts/create-user.ts`:

```typescript
import 'dotenv/config';
import readline from 'node:readline';
import { db, schema } from '../db/index.js';
import { hashPassword } from '../services/auth.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function main() {
  const username = await question('Username: ');
  const password = await question('Password: ');

  if (!username || !password) {
    console.error('Username and password are required.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  await db.insert(schema.users).values({
    username,
    passwordHash,
  });

  console.log(`User "${username}" created successfully.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to create user:', err);
  process.exit(1);
});
```

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/services/ packages/backend/src/middleware/ packages/backend/src/routes/auth.ts packages/backend/src/scripts/
git commit -m "feat: add auth service with session management, brute-force protection, and login routes"
```

---

### Task 6: Health Endpoint

**Files:**
- Create: `packages/backend/src/routes/health.ts`

- [ ] **Step 1: Write failing test for health route**

Create `packages/backend/src/routes/__tests__/health.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';

// Mock the db module to avoid needing a real DB connection in unit tests
vi.mock('../../db/index.js', () => ({
  db: {
    execute: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}));

import { healthRoutes } from '../health.js';

describe('GET /health', () => {
  it('should return status ok when DB is reachable', async () => {
    const app = Fastify();
    await app.register(healthRoutes, { prefix: '/shieldtest/api' });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/shieldtest/api/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('uptime');
    expect(body.checks.database).toBe('ok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/backend && npx vitest run src/routes/__tests__/health.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create health route**

```typescript
import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    let dbStatus = 'ok';
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbStatus = 'error';
    }

    const status = dbStatus === 'ok' ? 'ok' : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      checks: { database: dbStatus },
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/backend && npx vitest run src/routes/__tests__/health.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/health.ts packages/backend/src/routes/__tests__/
git commit -m "feat: add health endpoint at /shieldtest/api/health"
```

---

### Task 7: Frontend Scaffold

**Files:**
- Create: `packages/frontend/package.json`
- Create: `packages/frontend/tsconfig.json`
- Create: `packages/frontend/tsconfig.node.json`
- Create: `packages/frontend/vite.config.ts`
- Create: `packages/frontend/tailwind.config.js`
- Create: `packages/frontend/postcss.config.js`
- Create: `packages/frontend/index.html`
- Create: `packages/frontend/src/main.tsx`
- Create: `packages/frontend/src/App.tsx`
- Create: `packages/frontend/src/index.css`
- Create: `packages/frontend/src/api/client.ts`
- Create: `packages/frontend/src/pages/Login.tsx`
- Create: `packages/frontend/src/pages/Dashboard.tsx`
- Create: `packages/frontend/src/components/Layout.tsx`

- [ ] **Step 1: Create frontend package.json**

```json
{
  "name": "@shieldtest/frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "recharts": "^2.12.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create vite.config.ts with subpath base**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/shieldtest/',
  server: {
    proxy: {
      '/shieldtest/api': {
        target: 'http://localhost:3847',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 5: Create tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cloudflare Radar-inspired dark theme
        surface: {
          900: '#1a1a2e',
          800: '#16213e',
          700: '#1b2a4a',
          600: '#243356',
          500: '#3a4a6b',
        },
        accent: {
          blue: '#3b82f6',
          orange: '#f97316',
          green: '#22c55e',
          red: '#ef4444',
          yellow: '#eab308',
        },
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 6: Create postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 7: Create index.html**

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ShieldTest — DNS Filtering Benchmark</title>
  </head>
  <body class="bg-surface-900 text-gray-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
```

- [ ] **Step 9: Create main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/shieldtest">
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 10: Create API client**

```typescript
const API_BASE = '/shieldtest/api';

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      searchParams.set(key, String(value));
    }
    url += `?${searchParams.toString()}`;
  }

  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: { code: 'UNKNOWN', message: 'Request failed' } }));
    throw new ApiError(response.status, errorBody.error?.code || 'UNKNOWN', errorBody.error?.message || 'Request failed');
  }

  return response.json();
}
```

- [ ] **Step 11: Create Layout component**

```tsx
import { Link, useLocation, Outlet } from 'react-router-dom';
import { api } from '../api/client';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '~' },
  { path: '/sources', label: 'Sources', icon: '~' },
  { path: '/profiles', label: 'Profiles', icon: '~' },
  { path: '/runs', label: 'Runs', icon: '~' },
  { path: '/probes', label: 'Probes', icon: '~' },
  { path: '/settings', label: 'Settings', icon: '~' },
];

export default function Layout() {
  const location = useLocation();

  const handleLogout = async () => {
    await api('/auth/logout', { method: 'POST' });
    window.location.href = '/shieldtest/login';
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <nav className="w-56 bg-surface-800 border-r border-surface-500 flex flex-col">
        <div className="p-4 border-b border-surface-500">
          <h1 className="text-lg font-bold text-accent-blue">ShieldTest</h1>
          <p className="text-xs text-gray-400">DNS Filtering Benchmark</p>
        </div>
        <div className="flex-1 py-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`block px-4 py-2 text-sm transition-colors ${
                location.pathname === item.path
                  ? 'bg-surface-600 text-accent-blue border-r-2 border-accent-blue'
                  : 'text-gray-300 hover:bg-surface-700 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="p-4 border-t border-surface-500">
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Log out
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-surface-900 p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 12: Create Login page**

```tsx
import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api('/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-900">
      <div className="w-full max-w-sm p-8 bg-surface-800 rounded-lg border border-surface-500">
        <h1 className="text-2xl font-bold text-center text-accent-blue mb-2">ShieldTest</h1>
        <p className="text-sm text-gray-400 text-center mb-6">DNS Filtering Benchmark Platform</p>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="block mb-4">
            <span className="text-sm text-gray-300">Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded text-gray-100 text-sm focus:outline-none focus:border-accent-blue"
              required
              autoFocus
            />
          </label>

          <label className="block mb-6">
            <span className="text-sm text-gray-300">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded text-gray-100 text-sm focus:outline-none focus:border-accent-blue"
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-accent-blue text-white rounded text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-xs text-gray-500 text-center">
          Safe benchmarking for defensive security testing only
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 13: Create placeholder Dashboard page**

```tsx
export default function Dashboard() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-500">
          <p className="text-sm text-gray-400">Overall Score</p>
          <p className="text-3xl font-bold text-accent-blue mt-1">--</p>
        </div>
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-500">
          <p className="text-sm text-gray-400">Total Indicators</p>
          <p className="text-3xl font-bold text-gray-100 mt-1">--</p>
        </div>
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-500">
          <p className="text-sm text-gray-400">Active Probes</p>
          <p className="text-3xl font-bold text-accent-green mt-1">--</p>
        </div>
        <div className="p-4 bg-surface-800 rounded-lg border border-surface-500">
          <p className="text-sm text-gray-400">Last Sync</p>
          <p className="text-3xl font-bold text-gray-100 mt-1">--</p>
        </div>
      </div>
      <p className="mt-8 text-gray-500 text-sm">
        Configure sources and run your first benchmark to see results here.
      </p>
    </div>
  );
}
```

- [ ] **Step 14: Create App.tsx with routes**

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        {/* Placeholder routes for later plans */}
        <Route path="sources" element={<div className="text-gray-400">Sources — coming soon</div>} />
        <Route path="profiles" element={<div className="text-gray-400">Benchmark Profiles — coming soon</div>} />
        <Route path="runs" element={<div className="text-gray-400">Runs — coming soon</div>} />
        <Route path="probes" element={<div className="text-gray-400">Probes — coming soon</div>} />
        <Route path="settings" element={<div className="text-gray-400">Settings — coming soon</div>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 15: Commit**

```bash
git add packages/frontend/
git commit -m "feat: add frontend scaffold with login, dashboard, layout, and dark theme"
```

---

### Task 8: Probe Package Placeholder

**Files:**
- Create: `packages/probe/package.json`
- Create: `packages/probe/tsconfig.json`
- Create: `packages/probe/src/index.ts`
- Create: `packages/probe/.env.example`

- [ ] **Step 1: Create probe package.json**

```json
{
  "name": "@shieldtest/probe",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@shieldtest/shared": "*",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "tsx": "^4.7.0"
  }
}
```

- [ ] **Step 2: Create probe tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../shared" }
  ]
}
```

- [ ] **Step 3: Create probe .env.example**

```bash
# ShieldTest Probe Configuration
SERVER_URL=https://my6.my/shieldtest/api
PROBE_ID=your-probe-uuid-here
PROBE_TOKEN=your-probe-token-here

# Optional: DNS-only mode (skip HTTP HEAD checks)
DNS_ONLY=false

# Optional: Block page detection
BLOCK_PAGE_IPS=192.168.1.1
BLOCK_PAGE_SIGNATURES=FortiGuard,Sophos,pfSense
```

- [ ] **Step 4: Create placeholder index.ts**

```typescript
import 'dotenv/config';

console.log('ShieldTest Probe Agent');
console.log('Status: placeholder — full implementation in Plan 3');
console.log('Server:', process.env.SERVER_URL || 'not configured');
```

- [ ] **Step 5: Commit**

```bash
git add packages/probe/
git commit -m "feat: add probe package placeholder"
```

---

### Task 9: PM2 + NGINX Config

**Files:**
- Create: `config/ecosystem.config.js`
- Create: `config/nginx.conf`

- [ ] **Step 1: Create PM2 config**

```javascript
module.exports = {
  apps: [
    {
      name: 'shieldtest',
      script: 'packages/backend/dist/server.js',
      cwd: '/opt/shieldtest',
      instances: 1,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      // Log configuration
      error_file: '/var/log/shieldtest/error.log',
      out_file: '/var/log/shieldtest/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
```

- [ ] **Step 2: Create NGINX config**

```nginx
# ShieldTest — add this inside the existing my6.my server block
# Requires NGINX 1.24+

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

# ShieldTest API (CSP omitted — API returns JSON, not HTML)
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

- [ ] **Step 3: Commit**

```bash
git add config/
git commit -m "feat: add PM2 and NGINX production configs"
```

---

### Task 10: Install Dependencies + Verify Build

- [ ] **Step 1: Install all dependencies**

Run: `npm install` (from root)
Expected: All workspace packages install successfully

- [ ] **Step 2: Build shared package**

Run: `npm run build -w packages/shared`
Expected: Compiles to `packages/shared/dist/`

- [ ] **Step 3: Build backend**

Run: `npm run build -w packages/backend`
Expected: Compiles to `packages/backend/dist/`

- [ ] **Step 4: Build frontend**

Run: `npm run build -w packages/frontend`
Expected: Builds to `packages/frontend/dist/` with hashed assets

- [ ] **Step 5: Run backend tests**

Run: `cd packages/backend && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Verify health endpoint manually**

Run: `cd packages/backend && DATABASE_URL=postgresql://shieldtest:shieldtest@localhost:5432/shieldtest SESSION_SECRET=test-secret-12345678901234567890 npx tsx src/server.ts &`
Then: `curl http://localhost:3847/shieldtest/api/health`
Expected: `{"status":"ok","timestamp":"...","uptime":...,"version":"1.0.0"}`
Cleanup: kill the background process

- [ ] **Step 7: Commit any lockfile changes**

```bash
git add package-lock.json
git commit -m "chore: add package-lock.json after dependency install"
```

---

### Task 11: Docker Compose for Local Dev (Optional)

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
# Optional: for local development if PostgreSQL/Redis aren't installed natively
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: shieldtest
      POSTGRES_PASSWORD: shieldtest
      POSTGRES_DB: shieldtest
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

volumes:
  pgdata:
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add Docker Compose for local dev databases"
```

---

## Summary

After completing all 11 tasks, you will have:

- A working npm workspaces monorepo with 4 packages
- Complete database schema with all 12 tables, indexes, and foreign keys
- Session-based auth with login/logout, brute-force protection
- Health endpoint at `/shieldtest/api/health`
- React frontend with dark theme, login page, sidebar layout, placeholder dashboard
- PM2 and NGINX production configs
- Unit tests for auth and health

**Next plan:** Plan 2: Dataset Ingestion (source connectors, BullMQ jobs, indicator storage)
