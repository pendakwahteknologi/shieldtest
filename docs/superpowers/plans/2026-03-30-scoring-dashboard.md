# Scoring + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the scoring engine that calculates per-category rates and overall benchmark scores, dashboard API endpoints for trends, CSV/JSON export, settings management, and the full frontend with charts and data pages.

**Architecture:** Scoring runs after a benchmark completes — calculates block rates per category, consistency vs previous run, latency penalty, and weighted overall score. Dashboard API aggregates scorecard data for trends. Frontend uses Recharts for visualisation. Export endpoints stream CSV/JSON from run results.

**Tech Stack:** Drizzle ORM, Recharts, Fastify, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-30-shieldtest-design.md`
**Depends on:** Plans 1-3 (complete)

---

## File Structure

```
packages/backend/src/
├── scoring/
│   ├── engine.ts              # Score calculation logic
│   └── __tests__/
│       └── engine.test.ts     # Unit tests for scoring
├── routes/
│   ├── dashboard.ts           # Dashboard overview + category detail API
│   ├── reports.ts             # CSV/JSON export endpoints
│   └── settings.ts            # App settings CRUD
└── server.ts                  # Modified: register new routes

packages/frontend/src/
├── pages/
│   ├── Dashboard.tsx          # Full dashboard with charts (replace placeholder)
│   ├── Sources.tsx            # Source management page
│   ├── Profiles.tsx           # Benchmark profile management
│   ├── Runs.tsx               # Run listing page
│   ├── RunDetail.tsx          # Individual run detail with results
│   ├── Probes.tsx             # Probe management page
│   └── Settings.tsx           # Settings page
├── components/
│   ├── Layout.tsx             # Already exists — minor updates
│   ├── ScoreGauge.tsx         # Overall score ring/gauge
│   ├── CategoryBars.tsx       # Category pass rate bars
│   └── VerdictChart.tsx       # Verdict distribution donut
└── App.tsx                    # Updated routes
```

---

### Task 1: Scoring Engine

**Files:**
- Create: `packages/backend/src/scoring/engine.ts`
- Create: `packages/backend/src/scoring/__tests__/engine.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/backend/src/scoring/__tests__/engine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateBlockRate, calculateConsistencyScore, calculateLatencyPenalty, calculateOverallScore } from '../engine.js';

describe('calculateBlockRate', () => {
  it('should calculate block rate excluding infrastructure failures', () => {
    const items = [
      { verdict: 'BLOCKED_NXDOMAIN' },
      { verdict: 'BLOCKED_SINKHOLE' },
      { verdict: 'ALLOWED' },
      { verdict: 'TIMEOUT' },
      { verdict: 'DNS_ERROR' },
    ];
    // 2 blocked, 1 allowed, 2 infra failures excluded = 2/3
    expect(calculateBlockRate(items)).toBeCloseTo(2 / 3, 4);
  });

  it('should return 0 for empty array', () => {
    expect(calculateBlockRate([])).toBe(0);
  });

  it('should return 1.0 when all are blocked', () => {
    const items = [{ verdict: 'BLOCKED_NXDOMAIN' }, { verdict: 'BLOCKED_BLOCKPAGE' }];
    expect(calculateBlockRate(items)).toBe(1);
  });
});

describe('calculateConsistencyScore', () => {
  it('should return 1.0 for first run (no previous)', () => {
    expect(calculateConsistencyScore({}, null)).toBe(1.0);
  });

  it('should return 1.0 when rates are identical', () => {
    const current = { malware: 0.95, phishing: 0.90 };
    const previous = { malware: 0.95, phishing: 0.90 };
    expect(calculateConsistencyScore(current, previous)).toBe(1.0);
  });

  it('should reduce for large deltas', () => {
    const current = { malware: 0.95 };
    const previous = { malware: 0.80 }; // 15% delta -> beyond 10% -> 0.0 contribution
    expect(calculateConsistencyScore(current, previous)).toBe(0.0);
  });
});

describe('calculateLatencyPenalty', () => {
  it('should return 0 for latency under 200ms', () => {
    expect(calculateLatencyPenalty(150)).toBe(0);
  });

  it('should return max 5.0 for very high latency', () => {
    expect(calculateLatencyPenalty(2000)).toBe(5.0);
  });

  it('should scale linearly between 200ms and 1000ms', () => {
    // At 600ms: (600-200)/800 * 5.0 = 2.5
    expect(calculateLatencyPenalty(600)).toBeCloseTo(2.5, 1);
  });
});

describe('calculateOverallScore', () => {
  it('should produce score between 0 and 100', () => {
    const score = calculateOverallScore({
      malwareBlockRate: 0.95,
      phishingBlockRate: 0.90,
      adultFilterRate: 0.80,
      adsTrackerBlockRate: 0.70,
      cleanAllowRate: 0.98,
      consistencyScore: 1.0,
      latencyPenalty: 0,
    });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should apply latency penalty', () => {
    const base = calculateOverallScore({
      malwareBlockRate: 1, phishingBlockRate: 1, adultFilterRate: 1,
      adsTrackerBlockRate: 1, cleanAllowRate: 1, consistencyScore: 1, latencyPenalty: 0,
    });
    const penalised = calculateOverallScore({
      malwareBlockRate: 1, phishingBlockRate: 1, adultFilterRate: 1,
      adsTrackerBlockRate: 1, cleanAllowRate: 1, consistencyScore: 1, latencyPenalty: 5,
    });
    expect(penalised).toBe(base - 5);
  });
});
```

- [ ] **Step 2: Create scoring engine**

Create `packages/backend/src/scoring/engine.ts`:

```typescript
import { eq, and, sql, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const INFRA_VERDICTS = new Set(['TIMEOUT', 'DNS_ERROR', 'TLS_ERROR', 'NETWORK_ERROR', 'UNKNOWN']);
const BLOCKED_VERDICTS = new Set(['BLOCKED_NXDOMAIN', 'BLOCKED_SINKHOLE', 'BLOCKED_BLOCKPAGE']);

export function calculateBlockRate(items: Array<{ verdict: string | null }>): number {
  const eligible = items.filter((i) => i.verdict && !INFRA_VERDICTS.has(i.verdict));
  if (eligible.length === 0) return 0;
  const blocked = eligible.filter((i) => BLOCKED_VERDICTS.has(i.verdict!));
  return blocked.length / eligible.length;
}

export function calculateConsistencyScore(
  currentRates: Record<string, number>,
  previousRates: Record<string, number> | null,
): number {
  if (!previousRates) return 1.0;

  const categories = Object.keys(currentRates);
  if (categories.length === 0) return 1.0;

  let totalScore = 0;
  for (const cat of categories) {
    const current = currentRates[cat] ?? 0;
    const previous = previousRates[cat] ?? 0;
    const delta = Math.abs(current - previous);
    // Within 5% = 1.0, linear decay to 0.0 at 10%+
    const catScore = 1.0 - Math.min(delta / 0.05, 1.0);
    totalScore += Math.max(0, catScore);
  }

  return totalScore / categories.length;
}

export function calculateLatencyPenalty(avgLatencyMs: number): number {
  if (avgLatencyMs <= 200) return 0;
  return Math.min(((avgLatencyMs - 200) / 800), 1.0) * 5.0;
}

interface ScoreInputs {
  malwareBlockRate: number;
  phishingBlockRate: number;
  adultFilterRate: number;
  adsTrackerBlockRate: number;
  cleanAllowRate: number;
  consistencyScore: number;
  latencyPenalty: number;
}

const DEFAULT_WEIGHTS = {
  malware: 0.35,
  phishing: 0.25,
  adult: 0.15,
  adsTracker: 0.10,
  clean: 0.10,
  consistency: 0.05,
};

export function calculateOverallScore(inputs: ScoreInputs, weights = DEFAULT_WEIGHTS): number {
  const raw =
    weights.malware * inputs.malwareBlockRate +
    weights.phishing * inputs.phishingBlockRate +
    weights.adult * inputs.adultFilterRate +
    weights.adsTracker * inputs.adsTrackerBlockRate +
    weights.clean * inputs.cleanAllowRate +
    weights.consistency * inputs.consistencyScore;

  const score = raw * 100 - inputs.latencyPenalty;
  return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
}

export async function calculateAndStoreScorecard(runId: string): Promise<void> {
  const items = await db
    .select({ verdict: schema.benchmarkRunItems.verdict, category: schema.benchmarkRunItems.category, latencyMs: schema.benchmarkRunItems.latencyMs })
    .from(schema.benchmarkRunItems)
    .where(eq(schema.benchmarkRunItems.runId, runId));

  const byCategory = new Map<string, Array<{ verdict: string | null }>>();
  let totalLatency = 0;
  let latencyCount = 0;

  for (const item of items) {
    const list = byCategory.get(item.category) || [];
    list.push({ verdict: item.verdict });
    byCategory.set(item.category, list);
    if (item.latencyMs) { totalLatency += item.latencyMs; latencyCount++; }
  }

  const malwareBlockRate = calculateBlockRate(byCategory.get('malware') || []);
  const phishingBlockRate = calculateBlockRate(byCategory.get('phishing') || []);
  const adultFilterRate = calculateBlockRate(byCategory.get('adult') || []);
  const adsItems = [...(byCategory.get('ads') || []), ...(byCategory.get('tracker') || [])];
  const adsTrackerBlockRate = calculateBlockRate(adsItems);

  const cleanItems = byCategory.get('clean') || [];
  const eligibleClean = cleanItems.filter((i) => i.verdict && !INFRA_VERDICTS.has(i.verdict));
  const cleanAllowRate = eligibleClean.length > 0
    ? eligibleClean.filter((i) => i.verdict === 'ALLOWED').length / eligibleClean.length
    : 1;

  // Get previous scorecard for consistency
  const [prevScorecard] = await db
    .select()
    .from(schema.scorecards)
    .innerJoin(schema.benchmarkRuns, eq(schema.scorecards.runId, schema.benchmarkRuns.id))
    .where(sql`${schema.benchmarkRuns.id} != ${runId}`)
    .orderBy(desc(schema.scorecards.createdAt))
    .limit(1);

  const previousRates = prevScorecard ? {
    malware: prevScorecard.scorecards.malwareBlockRate ?? 0,
    phishing: prevScorecard.scorecards.phishingBlockRate ?? 0,
    adult: prevScorecard.scorecards.adultFilterRate ?? 0,
    adsTracker: prevScorecard.scorecards.adsTrackerBlockRate ?? 0,
  } : null;

  const currentRates = { malware: malwareBlockRate, phishing: phishingBlockRate, adult: adultFilterRate, adsTracker: adsTrackerBlockRate };
  const consistencyScore = calculateConsistencyScore(currentRates, previousRates);

  const avgLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;
  const latencyPenalty = calculateLatencyPenalty(avgLatency);

  const overallScore = calculateOverallScore({
    malwareBlockRate, phishingBlockRate, adultFilterRate,
    adsTrackerBlockRate, cleanAllowRate, consistencyScore, latencyPenalty,
  });

  await db.insert(schema.scorecards).values({
    runId,
    malwareBlockRate, phishingBlockRate, adultFilterRate,
    adsTrackerBlockRate, cleanAllowRate, consistencyScore,
    latencyPenalty, overallScore,
  }).onConflictDoUpdate({
    target: schema.scorecards.runId,
    set: { malwareBlockRate, phishingBlockRate, adultFilterRate, adsTrackerBlockRate, cleanAllowRate, consistencyScore, latencyPenalty, overallScore, createdAt: new Date() },
  });
}
```

- [ ] **Step 3: Run tests, verify pass, commit**

```bash
cd /home/adilhidayat/shieldtest/packages/backend && npx vitest run src/scoring/__tests__/engine.test.ts
git add packages/backend/src/scoring/
git commit -m "feat: add scoring engine with block rate, consistency, and latency calculations"
```

---

### Task 2: Dashboard + Reports + Settings Routes

**Files:**
- Create: `packages/backend/src/routes/dashboard.ts`
- Create: `packages/backend/src/routes/reports.ts`
- Create: `packages/backend/src/routes/settings.ts`
- Modify: `packages/backend/src/server.ts`
- Modify: `packages/backend/src/services/benchmark.ts` — trigger scoring on run completion

- [ ] **Step 1: Create dashboard routes**

Create `packages/backend/src/routes/dashboard.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { eq, desc, sql, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { getLetterGrade } from '@shieldtest/shared';

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/dashboard/overview', async () => {
    // Latest scorecard
    const [latest] = await db
      .select()
      .from(schema.scorecards)
      .innerJoin(schema.benchmarkRuns, eq(schema.scorecards.runId, schema.benchmarkRuns.id))
      .where(eq(schema.benchmarkRuns.status, 'completed'))
      .orderBy(desc(schema.scorecards.createdAt))
      .limit(1);

    // Trend: last 20 scorecards
    const trend = await db
      .select({
        overallScore: schema.scorecards.overallScore,
        malwareBlockRate: schema.scorecards.malwareBlockRate,
        phishingBlockRate: schema.scorecards.phishingBlockRate,
        adultFilterRate: schema.scorecards.adultFilterRate,
        adsTrackerBlockRate: schema.scorecards.adsTrackerBlockRate,
        cleanAllowRate: schema.scorecards.cleanAllowRate,
        createdAt: schema.scorecards.createdAt,
        runId: schema.scorecards.runId,
      })
      .from(schema.scorecards)
      .orderBy(desc(schema.scorecards.createdAt))
      .limit(20);

    // Quick stats
    const [indicatorCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.indicators).where(eq(schema.indicators.isActive, true));
    const [probeCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.probeAgents).where(eq(schema.probeAgents.status, 'online'));

    const latestScore = latest?.scorecards?.overallScore ?? null;

    return {
      data: {
        overallScore: latestScore,
        letterGrade: latestScore !== null ? getLetterGrade(latestScore) : null,
        latestRun: latest?.benchmark_runs ?? null,
        trend: trend.reverse(),
        stats: {
          totalIndicators: indicatorCount.count,
          activeProbes: probeCount.count,
        },
      },
    };
  });

  app.get<{ Params: { category: string } }>('/dashboard/category/:category', async (request) => {
    const { category } = request.params;

    const scorecards = await db
      .select({
        runId: schema.scorecards.runId,
        malwareBlockRate: schema.scorecards.malwareBlockRate,
        phishingBlockRate: schema.scorecards.phishingBlockRate,
        adultFilterRate: schema.scorecards.adultFilterRate,
        adsTrackerBlockRate: schema.scorecards.adsTrackerBlockRate,
        cleanAllowRate: schema.scorecards.cleanAllowRate,
        createdAt: schema.scorecards.createdAt,
      })
      .from(schema.scorecards)
      .orderBy(desc(schema.scorecards.createdAt))
      .limit(20);

    const rateKey: Record<string, string> = {
      malware: 'malwareBlockRate',
      phishing: 'phishingBlockRate',
      adult: 'adultFilterRate',
      ads: 'adsTrackerBlockRate',
      tracker: 'adsTrackerBlockRate',
      clean: 'cleanAllowRate',
    };

    const key = rateKey[category] || 'malwareBlockRate';
    const trend = scorecards.reverse().map((sc) => ({
      runId: sc.runId,
      rate: (sc as Record<string, unknown>)[key] as number,
      createdAt: sc.createdAt,
    }));

    return { data: { category, trend } };
  });
}
```

- [ ] **Step 2: Create reports routes**

Create `packages/backend/src/routes/reports.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

export async function reportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get<{ Params: { runId: string } }>('/reports/:runId.json', async (request, reply) => {
    const items = await db.select().from(schema.benchmarkRunItems).where(eq(schema.benchmarkRunItems.runId, request.params.runId));
    if (items.length === 0) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found or no results' } });

    const [run] = await db.select().from(schema.benchmarkRuns).where(eq(schema.benchmarkRuns.id, request.params.runId)).limit(1);
    const [scorecard] = await db.select().from(schema.scorecards).where(eq(schema.scorecards.runId, request.params.runId)).limit(1);

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="shieldtest-run-${request.params.runId}.json"`);
    return { run, scorecard, results: items };
  });

  app.get<{ Params: { runId: string } }>('/reports/:runId.csv', async (request, reply) => {
    const items = await db.select().from(schema.benchmarkRunItems).where(eq(schema.benchmarkRunItems.runId, request.params.runId));
    if (items.length === 0) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found or no results' } });

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="shieldtest-run-${request.params.runId}.csv"`);

    const header = 'hostname,category,verdict,latency_ms,tested_at\n';
    const rows = items.map((i) =>
      `"${i.hostname}","${i.category}","${i.verdict || ''}",${i.latencyMs || ''},"${i.testedAt || ''}"`
    ).join('\n');

    return header + rows;
  });
}
```

- [ ] **Step 3: Create settings routes**

Create `packages/backend/src/routes/settings.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/settings', async () => {
    const settings = await db.select().from(schema.appSettings);
    const result: Record<string, unknown> = {};
    for (const s of settings) {
      result[s.key] = s.valueJson;
    }
    return { data: result };
  });

  app.put('/settings', async (request) => {
    const body = request.body as Record<string, unknown>;

    for (const [key, value] of Object.entries(body)) {
      await db
        .insert(schema.appSettings)
        .values({ key, valueJson: value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.appSettings.key,
          set: { valueJson: value, updatedAt: new Date() },
        });
    }

    return { ok: true };
  });
}
```

- [ ] **Step 4: Trigger scoring on run completion**

In `packages/backend/src/services/benchmark.ts`, add import at top:
```typescript
import { calculateAndStoreScorecard } from '../scoring/engine.js';
```

In the `submitResults` function, after the line that sets status to 'completed', add:
```typescript
    // Calculate scorecard
    await calculateAndStoreScorecard(runId);
```

- [ ] **Step 5: Register routes in server.ts**

Add imports and registrations for dashboardRoutes, reportRoutes, settingsRoutes.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/dashboard.ts packages/backend/src/routes/reports.ts packages/backend/src/routes/settings.ts packages/backend/src/services/benchmark.ts packages/backend/src/server.ts
git commit -m "feat: add dashboard, reports, settings routes and auto-scoring on run completion"
```

---

### Task 3: Frontend — Dashboard + Charts

**Files:**
- Replace: `packages/frontend/src/pages/Dashboard.tsx`
- Create: `packages/frontend/src/components/ScoreGauge.tsx`
- Create: `packages/frontend/src/components/CategoryBars.tsx`
- Create: `packages/frontend/src/components/VerdictChart.tsx`

- [ ] **Step 1: Create ScoreGauge component**

```tsx
import { getLetterGrade } from './utils';

interface ScoreGaugeProps {
  score: number | null;
}

function getGradeColour(grade: string): string {
  switch (grade) {
    case 'A': return 'text-accent-green';
    case 'B': return 'text-accent-blue';
    case 'C': return 'text-accent-yellow';
    case 'D': return 'text-accent-orange';
    case 'F': return 'text-accent-red';
    default: return 'text-gray-400';
  }
}

export default function ScoreGauge({ score }: ScoreGaugeProps) {
  if (score === null) {
    return (
      <div className="flex flex-col items-center justify-center p-6">
        <p className="text-5xl font-bold text-gray-500">--</p>
        <p className="text-sm text-gray-400 mt-2">No runs yet</p>
      </div>
    );
  }

  const grade = getLetterGrade(score);
  return (
    <div className="flex flex-col items-center justify-center p-6">
      <p className={`text-6xl font-bold ${getGradeColour(grade)}`}>{Math.round(score)}</p>
      <p className={`text-2xl font-bold mt-1 ${getGradeColour(grade)}`}>{grade}</p>
      <p className="text-sm text-gray-400 mt-1">Overall Score</p>
    </div>
  );
}

function getLetterGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}
```

- [ ] **Step 2: Create CategoryBars component**

```tsx
interface CategoryBarsProps {
  data: {
    malwareBlockRate: number | null;
    phishingBlockRate: number | null;
    adultFilterRate: number | null;
    adsTrackerBlockRate: number | null;
    cleanAllowRate: number | null;
  } | null;
}

const categories = [
  { key: 'malwareBlockRate', label: 'Malware', colour: 'bg-accent-red' },
  { key: 'phishingBlockRate', label: 'Phishing', colour: 'bg-accent-orange' },
  { key: 'adultFilterRate', label: 'Adult', colour: 'bg-purple-500' },
  { key: 'adsTrackerBlockRate', label: 'Ads/Trackers', colour: 'bg-accent-yellow' },
  { key: 'cleanAllowRate', label: 'Clean (Allow)', colour: 'bg-accent-green' },
];

export default function CategoryBars({ data }: CategoryBarsProps) {
  if (!data) return <p className="text-gray-500 text-sm">No data available</p>;

  return (
    <div className="space-y-3">
      {categories.map((cat) => {
        const value = (data as Record<string, number | null>)[cat.key];
        const pct = value !== null ? Math.round(value * 100) : 0;
        return (
          <div key={cat.key}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-300">{cat.label}</span>
              <span className="text-gray-400">{pct}%</span>
            </div>
            <div className="h-2 bg-surface-600 rounded-full overflow-hidden">
              <div className={`h-full ${cat.colour} rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create VerdictChart component**

```tsx
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface VerdictChartProps {
  data: Record<string, number>;
}

const VERDICT_COLOURS: Record<string, string> = {
  ALLOWED: '#22c55e',
  BLOCKED_NXDOMAIN: '#ef4444',
  BLOCKED_SINKHOLE: '#f97316',
  BLOCKED_BLOCKPAGE: '#eab308',
  TIMEOUT: '#6b7280',
  DNS_ERROR: '#9ca3af',
  UNKNOWN: '#4b5563',
};

export default function VerdictChart({ data }: VerdictChartProps) {
  const chartData = Object.entries(data).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0);

  if (chartData.length === 0) return <p className="text-gray-500 text-sm">No verdict data</p>;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={VERDICT_COLOURS[entry.name] || '#6b7280'} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ backgroundColor: '#16213e', border: '1px solid #3a4a6b', borderRadius: '8px' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Replace Dashboard.tsx with full implementation**

Full dashboard page using the API client, ScoreGauge, CategoryBars, and a Recharts line chart for trends.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/
git commit -m "feat: add dashboard with score gauge, category bars, and trend charts"
```

---

### Task 4: Frontend — All Remaining Pages

**Files:**
- Create: Sources.tsx, Profiles.tsx, Runs.tsx, RunDetail.tsx, Probes.tsx, Settings.tsx
- Update: App.tsx

All pages follow the same pattern: fetch from API, display in tables/cards with the dark theme. Each is a self-contained page component.

- [ ] **Step 1-6: Create all page components**
- [ ] **Step 7: Update App.tsx with real routes**
- [ ] **Step 8: Build frontend to verify**

```bash
cd /home/adilhidayat/shieldtest/packages/frontend && npx vite build
```

- [ ] **Step 9: Commit**

```bash
git add packages/frontend/src/
git commit -m "feat: add all frontend pages — sources, profiles, runs, probes, settings"
```

---

### Task 5: Final Verification

- [ ] **Step 1: Run all backend tests**
- [ ] **Step 2: Build frontend**
- [ ] **Step 3: Start server and verify dashboard endpoint**
- [ ] **Step 4: Commit lockfile**

---

## Summary

After completing all 5 tasks:

- Scoring engine with configurable weights, consistency, latency penalty
- Auto-scoring when benchmark runs complete
- Dashboard API with trends and stats
- CSV/JSON export endpoints
- Settings management API
- Full frontend: dashboard with charts, source management, profile management, run listing/detail, probe management, settings
- All UK English throughout

**Next plan:** Plan 5: Demo Mode + Polish
