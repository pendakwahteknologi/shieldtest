# Benchmark Builder + Probe Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build benchmark profile management, probe agent registration, benchmark run execution with job dispatch to probes, and result collection — enabling end-to-end benchmark testing.

**Architecture:** Benchmark profiles define sampling criteria. When a run starts, indicators are sampled and split into 50-item job batches dispatched via BullMQ. Probes poll for jobs, execute DNS/HTTP checks, and submit results. The backend tracks progress and auto-completes runs when all items are resolved.

**Tech Stack:** BullMQ, Drizzle ORM, Fastify, Node.js dns module (probe), crypto for token generation

**Spec:** `docs/superpowers/specs/2026-03-30-shieldtest-design.md`
**Depends on:** Foundation + Ingestion plans (complete)

---

## File Structure

```
packages/backend/src/
├── routes/
│   ├── profiles.ts       # Benchmark profile CRUD + preview
│   ├── runs.ts           # Run creation, listing, detail, results
│   └── probes.ts         # Probe registration, listing, deletion + probe-auth endpoints
├── services/
│   ├── benchmark.ts      # Sampling logic, run creation, job dispatch, completion
│   └── probes.ts         # Probe token generation, validation, heartbeat
├── middleware/
│   └── probe-auth.ts     # Probe token authentication middleware
├── queue/
│   └── benchmark-worker.ts  # Worker that checks for run completion
└── server.ts             # Modified: register new routes

packages/probe/src/
├── index.ts              # Entry point — starts polling loop
├── config.ts             # Env var loading
├── dns.ts                # DNS resolution checks
├── http.ts               # HTTP HEAD checks + block page detection
├── worker.ts             # Job polling, execution, result submission
└── sinkhole.ts           # Sinkhole IP detection
```

---

### Task 1: Probe Service + Token Auth Middleware

**Files:**
- Create: `packages/backend/src/services/probes.ts`
- Create: `packages/backend/src/middleware/probe-auth.ts`

- [ ] **Step 1: Create probe service**

Create `packages/backend/src/services/probes.ts`:

```typescript
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function registerProbe(name: string): Promise<{ probeId: string; token: string }> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);

  const [probe] = await db
    .insert(schema.probeAgents)
    .values({
      name,
      tokenHash,
      status: 'offline',
    })
    .returning({ id: schema.probeAgents.id });

  return { probeId: probe.id, token };
}

export async function validateProbeToken(probeId: string, token: string): Promise<boolean> {
  const tokenHash = hashToken(token);

  const [probe] = await db
    .select({ id: schema.probeAgents.id })
    .from(schema.probeAgents)
    .where(
      and(
        eq(schema.probeAgents.id, probeId),
        eq(schema.probeAgents.tokenHash, tokenHash),
      ),
    )
    .limit(1);

  return !!probe;
}

export async function updateHeartbeat(probeId: string, ipAddress?: string): Promise<void> {
  await db
    .update(schema.probeAgents)
    .set({
      lastHeartbeatAt: new Date(),
      ipAddress: ipAddress ?? null,
      status: 'online',
    })
    .where(eq(schema.probeAgents.id, probeId));
}

export async function deleteProbe(probeId: string): Promise<boolean> {
  const result = await db
    .delete(schema.probeAgents)
    .where(eq(schema.probeAgents.id, probeId))
    .returning({ id: schema.probeAgents.id });

  return result.length > 0;
}
```

- [ ] **Step 2: Create probe auth middleware**

Create `packages/backend/src/middleware/probe-auth.ts`:

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { validateProbeToken } from '../services/probes.js';

declare module 'fastify' {
  interface FastifyRequest {
    probeId?: string;
  }
}

export async function requireProbeAuth(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Probe token required' } });
    return;
  }

  const token = authHeader.slice(7);
  const probeId = (request.params as { id?: string }).id;

  if (!probeId) {
    reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Probe ID required' } });
    return;
  }

  const valid = await validateProbeToken(probeId, token);
  if (!valid) {
    reply.status(401).send({ error: { code: 'INVALID_TOKEN', message: 'Invalid probe token for this probe ID' } });
    return;
  }

  request.probeId = probeId;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/services/probes.ts packages/backend/src/middleware/probe-auth.ts
git commit -m "feat: add probe service with token auth and heartbeat"
```

---

### Task 2: Benchmark Service (Sampling + Run Creation)

**Files:**
- Create: `packages/backend/src/services/benchmark.ts`
- Create: `packages/backend/src/services/__tests__/benchmark.test.ts`

- [ ] **Step 1: Write test for sampling logic**

Create `packages/backend/src/services/__tests__/benchmark.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildSampleSet } from '../benchmark.js';

// Note: buildSampleSet is tested as a pure function with mock data.
// The DB-dependent parts (createRun, completeRun) are tested via integration.

describe('buildSampleSet', () => {
  const indicators = [
    { id: '1', hostname: 'evil1.com', category: 'malware', confidence: 90 },
    { id: '2', hostname: 'evil2.com', category: 'malware', confidence: 80 },
    { id: '3', hostname: 'evil3.com', category: 'malware', confidence: 70 },
    { id: '4', hostname: 'phish1.com', category: 'phishing', confidence: 85 },
    { id: '5', hostname: 'phish2.com', category: 'phishing', confidence: 75 },
    { id: '6', hostname: 'clean1.com', category: 'clean', confidence: 95 },
    { id: '7', hostname: 'clean2.com', category: 'clean', confidence: 85 },
  ];

  it('should sample up to sampleSize per category', () => {
    const result = buildSampleSet(indicators, { sampleSize: 2, minConfidence: 0 });
    const malware = result.filter((i) => i.category === 'malware');
    const phishing = result.filter((i) => i.category === 'phishing');
    expect(malware.length).toBe(2);
    expect(phishing.length).toBe(2);
  });

  it('should filter by minimum confidence', () => {
    const result = buildSampleSet(indicators, { sampleSize: 10, minConfidence: 80 });
    expect(result.every((i) => i.confidence >= 80)).toBe(true);
  });

  it('should return all if sample size exceeds available', () => {
    const result = buildSampleSet(indicators, { sampleSize: 100, minConfidence: 0 });
    expect(result.length).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/adilhidayat/shieldtest/packages/backend && npx vitest run src/services/__tests__/benchmark.test.ts`
Expected: FAIL

- [ ] **Step 3: Create benchmark service**

Create `packages/backend/src/services/benchmark.ts`:

```typescript
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { Queue } from 'bullmq';
import { redisConnection } from '../queue/connection.js';

// Job queue for benchmark work
export const benchmarkQueue = new Queue('benchmark-jobs', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

interface IndicatorForSampling {
  id: string;
  hostname: string;
  category: string;
  confidence: number;
}

interface SampleOptions {
  sampleSize: number;
  minConfidence: number;
}

// Pure function for sampling — testable without DB
export function buildSampleSet(
  indicators: IndicatorForSampling[],
  options: SampleOptions,
): IndicatorForSampling[] {
  const { sampleSize, minConfidence } = options;

  // Filter by confidence
  const filtered = indicators.filter((i) => i.confidence >= minConfidence);

  // Group by category
  const byCategory = new Map<string, IndicatorForSampling[]>();
  for (const ind of filtered) {
    const list = byCategory.get(ind.category) || [];
    list.push(ind);
    byCategory.set(ind.category, list);
  }

  // Sample from each category
  const result: IndicatorForSampling[] = [];
  for (const [, categoryInds] of byCategory) {
    // Shuffle for randomness
    const shuffled = [...categoryInds].sort(() => Math.random() - 0.5);
    result.push(...shuffled.slice(0, sampleSize));
  }

  return result;
}

export interface PreviewResult {
  counts: Record<string, number>;
  total: number;
}

export async function previewProfile(profileId: string): Promise<PreviewResult> {
  const [profile] = await db
    .select()
    .from(schema.benchmarkProfiles)
    .where(eq(schema.benchmarkProfiles.id, profileId))
    .limit(1);

  if (!profile) throw new Error('Profile not found');

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - profile.recencyWindowDays);

  const indicators = await db
    .select({
      id: schema.indicators.id,
      hostname: schema.indicators.hostname,
      category: schema.indicators.category,
      confidence: schema.indicators.confidence,
    })
    .from(schema.indicators)
    .where(
      and(
        eq(schema.indicators.isActive, true),
        gte(schema.indicators.lastSeenAt, cutoff),
      ),
    );

  const sampled = buildSampleSet(indicators, {
    sampleSize: profile.sampleSizePerCategory,
    minConfidence: profile.minConfidence,
  });

  const counts: Record<string, number> = {};
  for (const ind of sampled) {
    counts[ind.category] = (counts[ind.category] || 0) + 1;
  }

  return { counts, total: sampled.length };
}

export async function createRun(params: {
  profileId: string;
  probeId: string;
  routerName?: string;
  firmwareVersion?: string;
  resolverMode?: string;
  notes?: string;
  createdBy?: string;
}): Promise<{ runId: string; totalItems: number }> {
  const [profile] = await db
    .select()
    .from(schema.benchmarkProfiles)
    .where(eq(schema.benchmarkProfiles.id, params.profileId))
    .limit(1);

  if (!profile) throw new Error('Profile not found');

  // Sample indicators
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - profile.recencyWindowDays);

  const indicators = await db
    .select({
      id: schema.indicators.id,
      hostname: schema.indicators.hostname,
      category: schema.indicators.category,
      confidence: schema.indicators.confidence,
    })
    .from(schema.indicators)
    .where(
      and(
        eq(schema.indicators.isActive, true),
        gte(schema.indicators.lastSeenAt, cutoff),
      ),
    );

  const sampled = buildSampleSet(indicators, {
    sampleSize: profile.sampleSizePerCategory,
    minConfidence: profile.minConfidence,
  });

  if (sampled.length === 0) throw new Error('No indicators match the profile criteria');

  // Create run
  const [run] = await db
    .insert(schema.benchmarkRuns)
    .values({
      profileId: params.profileId,
      probeId: params.probeId,
      status: 'pending',
      routerName: params.routerName,
      firmwareVersion: params.firmwareVersion,
      resolverMode: params.resolverMode,
      notes: params.notes,
      totalItems: sampled.length,
      completedItems: 0,
      createdBy: params.createdBy,
    })
    .returning({ id: schema.benchmarkRuns.id });

  // Create run items
  for (let i = 0; i < sampled.length; i += 100) {
    const batch = sampled.slice(i, i + 100);
    await db.insert(schema.benchmarkRunItems).values(
      batch.map((ind) => ({
        runId: run.id,
        indicatorId: ind.id,
        hostname: ind.hostname,
        category: ind.category,
      })),
    );
  }

  // Split into job batches of 50 and enqueue
  for (let i = 0; i < sampled.length; i += 50) {
    const batch = sampled.slice(i, i + 50);

    // We need the actual run item IDs — fetch them
    const items = await db
      .select({ id: schema.benchmarkRunItems.id, hostname: schema.benchmarkRunItems.hostname, category: schema.benchmarkRunItems.category })
      .from(schema.benchmarkRunItems)
      .where(eq(schema.benchmarkRunItems.runId, run.id))
      .limit(50)
      .offset(i);

    await benchmarkQueue.add(
      `run-${run.id}-batch-${Math.floor(i / 50)}`,
      {
        runId: run.id,
        probeId: params.probeId,
        items: items.map((item) => ({
          itemId: item.id,
          hostname: item.hostname,
          category: item.category,
        })),
      },
      { jobId: `run-${run.id}-batch-${Math.floor(i / 50)}` },
    );
  }

  // Update run status to running
  await db
    .update(schema.benchmarkRuns)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(schema.benchmarkRuns.id, run.id));

  return { runId: run.id, totalItems: sampled.length };
}

export async function submitResults(
  runId: string,
  results: Array<{
    itemId: string;
    verdict: string;
    latencyMs: number;
    evidence: unknown;
  }>,
): Promise<void> {
  for (const result of results) {
    await db
      .update(schema.benchmarkRunItems)
      .set({
        verdict: result.verdict,
        latencyMs: result.latencyMs,
        evidenceJson: result.evidence,
        testedAt: new Date(),
      })
      .where(eq(schema.benchmarkRunItems.id, result.itemId));
  }

  // Update completed count
  const [run] = await db
    .select({ id: schema.benchmarkRuns.id, totalItems: schema.benchmarkRuns.totalItems })
    .from(schema.benchmarkRuns)
    .where(eq(schema.benchmarkRuns.id, runId))
    .limit(1);

  if (!run) return;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.benchmarkRunItems)
    .where(
      and(
        eq(schema.benchmarkRunItems.runId, runId),
        sql`${schema.benchmarkRunItems.verdict} IS NOT NULL`,
      ),
    );

  await db
    .update(schema.benchmarkRuns)
    .set({ completedItems: count })
    .where(eq(schema.benchmarkRuns.id, runId));

  // Check if run is complete
  if (count >= run.totalItems) {
    await db
      .update(schema.benchmarkRuns)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(schema.benchmarkRuns.id, runId));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/adilhidayat/shieldtest/packages/backend && npx vitest run src/services/__tests__/benchmark.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/benchmark.ts packages/backend/src/services/__tests__/benchmark.test.ts
git commit -m "feat: add benchmark service with sampling, run creation, and result submission"
```

---

### Task 3: Profile + Run + Probe API Routes

**Files:**
- Create: `packages/backend/src/routes/profiles.ts`
- Create: `packages/backend/src/routes/runs.ts`
- Create: `packages/backend/src/routes/probes.ts`
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1: Create profile routes**

Create `packages/backend/src/routes/profiles.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { previewProfile } from '../services/benchmark.js';

export async function profileRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/benchmark-profiles', async () => {
    const profiles = await db.select().from(schema.benchmarkProfiles).orderBy(schema.benchmarkProfiles.name);
    return { data: profiles };
  });

  app.get<{ Params: { id: string } }>('/benchmark-profiles/:id', async (request, reply) => {
    const [profile] = await db.select().from(schema.benchmarkProfiles).where(eq(schema.benchmarkProfiles.id, request.params.id)).limit(1);
    if (!profile) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Profile not found' } });
    return { data: profile };
  });

  app.post('/benchmark-profiles', async (request) => {
    const body = request.body as {
      name: string;
      description?: string;
      sampleSizePerCategory?: number;
      recencyWindowDays?: number;
      minConfidence?: number;
      samplingMode?: string;
    };

    const [profile] = await db
      .insert(schema.benchmarkProfiles)
      .values({
        name: body.name,
        description: body.description,
        sampleSizePerCategory: body.sampleSizePerCategory ?? 100,
        recencyWindowDays: body.recencyWindowDays ?? 30,
        minConfidence: body.minConfidence ?? 50,
        samplingMode: body.samplingMode ?? 'balanced',
        createdBy: request.userId,
      })
      .returning();

    return { data: profile };
  });

  app.put<{ Params: { id: string } }>('/benchmark-profiles/:id', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const allowed = ['name', 'description', 'sampleSizePerCategory', 'recencyWindowDays', 'minConfidence', 'samplingMode'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } });
    }

    const [updated] = await db.update(schema.benchmarkProfiles).set(updates).where(eq(schema.benchmarkProfiles.id, request.params.id)).returning();
    if (!updated) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Profile not found' } });
    return { data: updated };
  });

  app.delete<{ Params: { id: string } }>('/benchmark-profiles/:id', async (request, reply) => {
    try {
      const result = await db.delete(schema.benchmarkProfiles).where(eq(schema.benchmarkProfiles.id, request.params.id)).returning({ id: schema.benchmarkProfiles.id });
      if (result.length === 0) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Profile not found' } });
      return { ok: true };
    } catch {
      return reply.status(409).send({ error: { code: 'CONFLICT', message: 'Cannot delete profile with existing runs' } });
    }
  });

  app.get<{ Params: { id: string } }>('/benchmark-profiles/:id/preview', async (request, reply) => {
    try {
      const result = await previewProfile(request.params.id);
      return { data: result };
    } catch (err) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: String(err) } });
    }
  });
}
```

- [ ] **Step 2: Create run routes**

Create `packages/backend/src/routes/runs.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { eq, desc, sql, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { createRun } from '../services/benchmark.js';
import { PAGINATION_DEFAULTS } from '@shieldtest/shared';

export async function runRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/runs', async (request) => {
    const query = request.query as { page?: string; limit?: string; status?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(PAGINATION_DEFAULTS.maxLimit, Math.max(1, parseInt(query.limit || String(PAGINATION_DEFAULTS.limit), 10)));
    const offset = (page - 1) * limit;

    let baseQuery = db.select().from(schema.benchmarkRuns);
    if (query.status) {
      baseQuery = baseQuery.where(eq(schema.benchmarkRuns.status, query.status)) as typeof baseQuery;
    }

    const runs = await baseQuery.orderBy(desc(schema.benchmarkRuns.createdAt)).limit(limit).offset(offset);
    return { data: runs, pagination: { page, limit } };
  });

  app.post('/runs', async (request, reply) => {
    const body = request.body as {
      profileId: string;
      probeId: string;
      routerName?: string;
      firmwareVersion?: string;
      resolverMode?: string;
      notes?: string;
    };

    if (!body.profileId || !body.probeId) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'profileId and probeId are required' } });
    }

    try {
      const result = await createRun({ ...body, createdBy: request.userId });
      return { data: result };
    } catch (err) {
      return reply.status(400).send({ error: { code: 'RUN_ERROR', message: String(err) } });
    }
  });

  app.get<{ Params: { id: string } }>('/runs/:id', async (request, reply) => {
    const [run] = await db.select().from(schema.benchmarkRuns).where(eq(schema.benchmarkRuns.id, request.params.id)).limit(1);
    if (!run) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    return { data: run };
  });

  app.get<{ Params: { id: string } }>('/runs/:id/results', async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; category?: string; verdict?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(PAGINATION_DEFAULTS.maxLimit, Math.max(1, parseInt(query.limit || String(PAGINATION_DEFAULTS.limit), 10)));
    const offset = (page - 1) * limit;

    let baseQuery = db.select().from(schema.benchmarkRunItems).where(eq(schema.benchmarkRunItems.runId, request.params.id));

    if (query.category) {
      baseQuery = baseQuery.where(and(eq(schema.benchmarkRunItems.runId, request.params.id), eq(schema.benchmarkRunItems.category, query.category))) as typeof baseQuery;
    }

    const items = await baseQuery.limit(limit).offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.benchmarkRunItems)
      .where(eq(schema.benchmarkRunItems.runId, request.params.id));

    return { data: items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  });

  app.get<{ Params: { id: string } }>('/runs/:id/score', async (request, reply) => {
    const [scorecard] = await db.select().from(schema.scorecards).where(eq(schema.scorecards.runId, request.params.id)).limit(1);
    if (!scorecard) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Scorecard not found — run may not be completed' } });
    return { data: scorecard };
  });

  app.delete<{ Params: { id: string } }>('/runs/:id', async (request, reply) => {
    const result = await db.delete(schema.benchmarkRuns).where(eq(schema.benchmarkRuns.id, request.params.id)).returning({ id: schema.benchmarkRuns.id });
    if (result.length === 0) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    return { ok: true };
  });
}
```

- [ ] **Step 3: Create probe routes**

Create `packages/backend/src/routes/probes.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireProbeAuth } from '../middleware/probe-auth.js';
import { registerProbe, updateHeartbeat, deleteProbe } from '../services/probes.js';
import { submitResults } from '../services/benchmark.js';
import { benchmarkQueue } from '../services/benchmark.js';

export async function probeRoutes(app: FastifyInstance) {
  // Session-auth endpoints (admin manages probes)
  app.get('/probes', { preHandler: [requireAuth] }, async () => {
    const probes = await db.select({
      id: schema.probeAgents.id,
      name: schema.probeAgents.name,
      lastHeartbeatAt: schema.probeAgents.lastHeartbeatAt,
      ipAddress: schema.probeAgents.ipAddress,
      status: schema.probeAgents.status,
      concurrencyLimit: schema.probeAgents.concurrencyLimit,
      timeoutMs: schema.probeAgents.timeoutMs,
      createdAt: schema.probeAgents.createdAt,
    }).from(schema.probeAgents);
    return { data: probes };
  });

  app.post('/probes/register', { preHandler: [requireAuth] }, async (request, reply) => {
    const { name } = request.body as { name: string };
    if (!name) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Name is required' } });

    const result = await registerProbe(name);
    return { data: { probeId: result.probeId, token: result.token } };
  });

  app.delete<{ Params: { id: string } }>('/probes/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const deleted = await deleteProbe(request.params.id);
    if (!deleted) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Probe not found' } });
    return { ok: true };
  });

  // Probe-auth endpoints (probe authenticates with token)
  app.post<{ Params: { id: string } }>('/probes/:id/heartbeat', { preHandler: [requireProbeAuth] }, async (request) => {
    const ip = request.headers['x-real-ip'] as string || request.ip;
    await updateHeartbeat(request.params.id, ip);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/probes/:id/jobs', { preHandler: [requireProbeAuth] }, async (request) => {
    // Dequeue next job for this probe
    const job = await benchmarkQueue.getNextJob(request.params.id);

    if (!job) {
      return { items: [] };
    }

    const data = job.data as {
      runId: string;
      probeId: string;
      items: Array<{ itemId: string; hostname: string; category: string }>;
    };

    // Only return jobs meant for this probe
    if (data.probeId !== request.params.id) {
      return { items: [] };
    }

    return {
      jobId: job.id,
      runId: data.runId,
      items: data.items,
      config: {
        timeoutMs: 5000,
        doHttpCheck: true,
      },
    };
  });

  app.post<{ Params: { id: string } }>('/probes/:id/results', { preHandler: [requireProbeAuth] }, async (request) => {
    const body = request.body as {
      jobId: string;
      results: Array<{
        itemId: string;
        verdict: string;
        latencyMs: number;
        evidence: unknown;
      }>;
    };

    if (!body.results || body.results.length === 0) {
      return { ok: true };
    }

    // Find the run ID from any result item
    const [item] = await db
      .select({ runId: schema.benchmarkRunItems.runId })
      .from(schema.benchmarkRunItems)
      .where(eq(schema.benchmarkRunItems.id, body.results[0].itemId))
      .limit(1);

    if (item) {
      await submitResults(item.runId, body.results);
    }

    return { ok: true };
  });
}
```

- [ ] **Step 4: Register new routes in server.ts**

Add imports to `packages/backend/src/server.ts`:
```typescript
import { profileRoutes } from './routes/profiles.js';
import { runRoutes } from './routes/runs.js';
import { probeRoutes } from './routes/probes.js';
```

Register routes (after existing registrations):
```typescript
await app.register(profileRoutes, { prefix: config.apiBasePath });
await app.register(runRoutes, { prefix: config.apiBasePath });
await app.register(probeRoutes, { prefix: config.apiBasePath });
```

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/profiles.ts packages/backend/src/routes/runs.ts packages/backend/src/routes/probes.ts packages/backend/src/server.ts
git commit -m "feat: add profile, run, and probe API routes"
```

---

### Task 4: Probe Agent Implementation

**Files:**
- Create: `packages/probe/src/config.ts`
- Create: `packages/probe/src/sinkhole.ts`
- Create: `packages/probe/src/dns.ts`
- Create: `packages/probe/src/http.ts`
- Create: `packages/probe/src/worker.ts`
- Modify: `packages/probe/src/index.ts`

- [ ] **Step 1: Create probe config**

Create `packages/probe/src/config.ts`:

```typescript
import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  serverUrl: required('SERVER_URL'),
  probeId: required('PROBE_ID'),
  probeToken: required('PROBE_TOKEN'),
  dnsOnly: process.env.DNS_ONLY === 'true',
  blockPageIps: (process.env.BLOCK_PAGE_IPS || '').split(',').filter(Boolean),
  blockPageSignatures: (process.env.BLOCK_PAGE_SIGNATURES || '').split(',').filter(Boolean),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '3000', 10),
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10),
} as const;
```

- [ ] **Step 2: Create sinkhole detection**

Create `packages/probe/src/sinkhole.ts`:

```typescript
const SINKHOLE_IPS = new Set([
  '0.0.0.0',
  '0.0.0.1',
  '127.0.0.1',
  '::1',
  '146.112.61.104',
  '146.112.61.105',
  '185.228.168.10',
  '185.228.169.11',
]);

export function isSinkhole(ip: string): boolean {
  return SINKHOLE_IPS.has(ip);
}
```

- [ ] **Step 3: Create DNS checker**

Create `packages/probe/src/dns.ts`:

```typescript
import dns from 'node:dns';
import { promisify } from 'node:util';
import { isSinkhole } from './sinkhole.js';

const resolve4 = promisify(dns.resolve4);

export interface DnsResult {
  addresses: string[];
  rcode: string;
  durationMs: number;
  isSinkholed: boolean;
}

export async function checkDns(hostname: string, timeoutMs: number = 5000): Promise<DnsResult> {
  const start = Date.now();

  try {
    const addresses = await Promise.race([
      resolve4(hostname),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DNS_TIMEOUT')), timeoutMs),
      ),
    ]);

    const durationMs = Date.now() - start;
    const sinkholed = addresses.some(isSinkhole);

    return {
      addresses,
      rcode: 'NOERROR',
      durationMs,
      isSinkholed: sinkholed,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const error = err as { code?: string; message?: string };

    if (error.message === 'DNS_TIMEOUT') {
      return { addresses: [], rcode: 'TIMEOUT', durationMs, isSinkholed: false };
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return { addresses: [], rcode: 'NXDOMAIN', durationMs, isSinkholed: false };
    }

    return { addresses: [], rcode: error.code || 'SERVFAIL', durationMs, isSinkholed: false };
  }
}
```

- [ ] **Step 4: Create HTTP checker**

Create `packages/probe/src/http.ts`:

```typescript
import { config } from './config.js';

export interface HttpResult {
  statusCode: number;
  headers: Record<string, string>;
  durationMs: number;
  isBlockPage: boolean;
}

export async function checkHttp(hostname: string, timeoutMs: number = 5000): Promise<HttpResult | null> {
  if (config.dnsOnly) return null;

  const start = Date.now();

  try {
    const response = await fetch(`http://${hostname}/`, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    const durationMs = Date.now() - start;
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Block page detection
    let isBlockPage = false;

    // Check if resolved to a known block page IP
    if (config.blockPageIps.length > 0) {
      // We can't easily check resolved IP from fetch, so skip IP-based detection here
      // IP-based detection is handled in the DNS step
    }

    // HTTP fingerprint check
    const contentLength = parseInt(headers['content-length'] || '0', 10);
    const serverHeader = headers['server'] || '';

    if (response.status === 200 && contentLength > 0 && contentLength < 512) {
      // Check for known block page signatures
      const isKnownBlockPageServer = config.blockPageSignatures.some(
        (sig) => serverHeader.toLowerCase().includes(sig.toLowerCase()),
      );
      if (isKnownBlockPageServer) {
        isBlockPage = true;
      }
    }

    // Check for redirect to block page paths
    const location = headers['location'] || '';
    if (response.status >= 300 && response.status < 400) {
      const blockPaths = ['/blocked', '/filter', '/block', '/access-denied'];
      if (blockPaths.some((p) => location.toLowerCase().includes(p))) {
        isBlockPage = true;
      }
    }

    return {
      statusCode: response.status,
      headers,
      durationMs,
      isBlockPage,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Create worker (polling + execution)**

Create `packages/probe/src/worker.ts`:

```typescript
import { config } from './config.js';
import { checkDns } from './dns.js';
import { checkHttp } from './http.js';
import { isSinkhole } from './sinkhole.js';

interface JobItem {
  itemId: string;
  hostname: string;
  category: string;
}

interface Job {
  jobId: string;
  runId: string;
  items: JobItem[];
  config: { timeoutMs: number; doHttpCheck: boolean };
}

interface ProbeResult {
  itemId: string;
  verdict: string;
  latencyMs: number;
  evidence: {
    dns: { addresses: string[]; rcode: string; duration_ms: number };
    http?: { status_code: number; headers: Record<string, string>; duration_ms: number };
    error?: string;
  };
}

async function apiCall<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const url = `${config.serverUrl}${path}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${config.probeToken}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function checkItem(item: JobItem, timeoutMs: number): Promise<ProbeResult> {
  const dnsResult = await checkDns(item.hostname, timeoutMs);

  let verdict: string;

  if (dnsResult.rcode === 'TIMEOUT') {
    verdict = 'TIMEOUT';
  } else if (dnsResult.rcode === 'NXDOMAIN') {
    verdict = 'BLOCKED_NXDOMAIN';
  } else if (dnsResult.rcode !== 'NOERROR') {
    verdict = 'DNS_ERROR';
  } else if (dnsResult.isSinkholed) {
    verdict = 'BLOCKED_SINKHOLE';
  } else {
    // DNS resolved — check for block page IPs
    const resolvedToBlockPage = dnsResult.addresses.some((ip) =>
      config.blockPageIps.includes(ip),
    );
    if (resolvedToBlockPage) {
      verdict = 'BLOCKED_BLOCKPAGE';
    } else {
      verdict = 'ALLOWED';
    }
  }

  // Optional HTTP check
  let httpEvidence: ProbeResult['evidence']['http'] | undefined;

  if (verdict === 'ALLOWED' && !config.dnsOnly) {
    const httpResult = await checkHttp(item.hostname, timeoutMs);
    if (httpResult) {
      httpEvidence = {
        status_code: httpResult.statusCode,
        headers: httpResult.headers,
        duration_ms: httpResult.durationMs,
      };

      if (httpResult.isBlockPage) {
        verdict = 'BLOCKED_BLOCKPAGE';
      }
    }
  }

  return {
    itemId: item.itemId,
    verdict,
    latencyMs: dnsResult.durationMs,
    evidence: {
      dns: {
        addresses: dnsResult.addresses,
        rcode: dnsResult.rcode,
        duration_ms: dnsResult.durationMs,
      },
      http: httpEvidence,
    },
  };
}

export async function pollAndExecute(): Promise<boolean> {
  try {
    const job = await apiCall<Job>(`/probes/${config.probeId}/jobs`);

    if (!job.items || job.items.length === 0) {
      return false; // No work
    }

    console.log(`Received job ${job.jobId} with ${job.items.length} items`);

    // Process items with concurrency limit of 5
    const results: ProbeResult[] = [];
    const concurrency = 5;

    for (let i = 0; i < job.items.length; i += concurrency) {
      const batch = job.items.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((item) => checkItem(item, job.config.timeoutMs)),
      );
      results.push(...batchResults);
    }

    // Submit results
    await apiCall(`/probes/${config.probeId}/results`, {
      method: 'POST',
      body: { jobId: job.jobId, results },
    });

    console.log(`Submitted ${results.length} results for job ${job.jobId}`);
    return true;
  } catch (err) {
    console.error('Poll error:', err);
    return false;
  }
}

export async function sendHeartbeat(): Promise<void> {
  try {
    await apiCall(`/probes/${config.probeId}/heartbeat`, { method: 'POST' });
  } catch (err) {
    console.error('Heartbeat error:', err);
  }
}
```

- [ ] **Step 6: Update probe index.ts**

Replace `packages/probe/src/index.ts`:

```typescript
import { config } from './config.js';
import { pollAndExecute, sendHeartbeat } from './worker.js';

console.log('ShieldTest Probe Agent starting...');
console.log(`Server: ${config.serverUrl}`);
console.log(`Probe ID: ${config.probeId}`);
console.log(`DNS-only mode: ${config.dnsOnly}`);

// Heartbeat loop
setInterval(sendHeartbeat, config.heartbeatIntervalMs);
sendHeartbeat();

// Polling loop
async function pollLoop() {
  while (true) {
    const hadWork = await pollAndExecute();
    // Poll faster if there was work, slower if idle
    const delay = hadWork ? 500 : config.pollIntervalMs;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

pollLoop().catch((err) => {
  console.error('Fatal probe error:', err);
  process.exit(1);
});
```

- [ ] **Step 7: Commit**

```bash
git add packages/probe/src/
git commit -m "feat: add probe agent with DNS/HTTP checks, sinkhole detection, and job polling"
```

---

### Task 5: Run All Tests + Verify

- [ ] **Step 1: Run all backend tests**

Run: `cd /home/adilhidayat/shieldtest/packages/backend && npx vitest run`
Expected: All tests pass (including new benchmark tests)

- [ ] **Step 2: Start server and verify new endpoints**

Run: `cd /home/adilhidayat/shieldtest && npx tsx packages/backend/src/server.ts &`
Wait 3 seconds, then:
```bash
# Login
curl -s -c cookies.txt -X POST http://localhost:3847/shieldtest/api/auth/login -H "Content-Type: application/json" -d '{"username":"testadmin","password":"testpassword123"}'

# List profiles (empty)
curl -s -b cookies.txt http://localhost:3847/shieldtest/api/benchmark-profiles

# List probes (empty)
curl -s -b cookies.txt http://localhost:3847/shieldtest/api/probes

# List runs (empty)
curl -s -b cookies.txt http://localhost:3847/shieldtest/api/runs
```
Expected: All return `{ data: [] }` with 200 status

Cleanup: `kill %1 && rm cookies.txt`

- [ ] **Step 3: Commit lockfile if changed**

```bash
git add package-lock.json && git commit -m "chore: update lockfile" --allow-empty
```

---

## Summary

After completing all 5 tasks:

- Probe service with token generation, validation, heartbeat
- Probe token auth middleware
- Benchmark service with sampling, run creation, job dispatch, result submission
- Profile CRUD + preview API routes
- Run creation, listing, detail, results, score, delete routes
- Probe registration, listing, deletion, heartbeat, job polling, result submission routes
- Full probe agent with DNS resolution, HTTP HEAD checks, sinkhole detection, block page detection
- Unit tests for sampling logic

**Next plan:** Plan 4: Scoring + Dashboard
