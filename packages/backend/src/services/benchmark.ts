import { eq, and, gte, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { Queue } from 'bullmq';
import { redisConnection } from '../queue/connection.js';

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

export function buildSampleSet(indicators: IndicatorForSampling[], options: SampleOptions): IndicatorForSampling[] {
  const { sampleSize, minConfidence } = options;
  const filtered = indicators.filter((i) => i.confidence >= minConfidence);
  const byCategory = new Map<string, IndicatorForSampling[]>();
  for (const ind of filtered) {
    const list = byCategory.get(ind.category) || [];
    list.push(ind);
    byCategory.set(ind.category, list);
  }
  const result: IndicatorForSampling[] = [];
  for (const [, categoryInds] of byCategory) {
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
  const [profile] = await db.select().from(schema.benchmarkProfiles).where(eq(schema.benchmarkProfiles.id, profileId)).limit(1);
  if (!profile) throw new Error('Profile not found');

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - profile.recencyWindowDays);

  const indicators = await db.select({
    id: schema.indicators.id,
    hostname: schema.indicators.hostname,
    category: schema.indicators.category,
    confidence: schema.indicators.confidence,
  }).from(schema.indicators).where(and(eq(schema.indicators.isActive, true), gte(schema.indicators.lastSeenAt, cutoff)));

  const sampled = buildSampleSet(indicators, { sampleSize: profile.sampleSizePerCategory, minConfidence: profile.minConfidence });

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
  const [profile] = await db.select().from(schema.benchmarkProfiles).where(eq(schema.benchmarkProfiles.id, params.profileId)).limit(1);
  if (!profile) throw new Error('Profile not found');

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - profile.recencyWindowDays);

  const indicators = await db.select({
    id: schema.indicators.id,
    hostname: schema.indicators.hostname,
    category: schema.indicators.category,
    confidence: schema.indicators.confidence,
  }).from(schema.indicators).where(and(eq(schema.indicators.isActive, true), gte(schema.indicators.lastSeenAt, cutoff)));

  const sampled = buildSampleSet(indicators, { sampleSize: profile.sampleSizePerCategory, minConfidence: profile.minConfidence });
  if (sampled.length === 0) throw new Error('No indicators match the profile criteria');

  const [run] = await db.insert(schema.benchmarkRuns).values({
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
  }).returning({ id: schema.benchmarkRuns.id });

  // Create run items in batches
  for (let i = 0; i < sampled.length; i += 100) {
    const batch = sampled.slice(i, i + 100);
    await db.insert(schema.benchmarkRunItems).values(batch.map((ind) => ({
      runId: run.id,
      indicatorId: ind.id,
      hostname: ind.hostname,
      category: ind.category,
    })));
  }

  // Split into job batches of 50 and enqueue
  for (let i = 0; i < sampled.length; i += 50) {
    const items = await db.select({
      id: schema.benchmarkRunItems.id,
      hostname: schema.benchmarkRunItems.hostname,
      category: schema.benchmarkRunItems.category,
    }).from(schema.benchmarkRunItems).where(eq(schema.benchmarkRunItems.runId, run.id)).limit(50).offset(i);

    await benchmarkQueue.add(`run-${run.id}-batch-${Math.floor(i / 50)}`, {
      runId: run.id,
      probeId: params.probeId,
      items: items.map((item) => ({ itemId: item.id, hostname: item.hostname, category: item.category })),
    }, { jobId: `run-${run.id}-batch-${Math.floor(i / 50)}` });
  }

  await db.update(schema.benchmarkRuns).set({ status: 'running', startedAt: new Date() }).where(eq(schema.benchmarkRuns.id, run.id));

  return { runId: run.id, totalItems: sampled.length };
}

export async function submitResults(runId: string, results: Array<{ itemId: string; verdict: string; latencyMs: number; evidence: unknown }>): Promise<void> {
  for (const result of results) {
    await db.update(schema.benchmarkRunItems).set({
      verdict: result.verdict,
      latencyMs: result.latencyMs,
      evidenceJson: result.evidence,
      testedAt: new Date(),
    }).where(eq(schema.benchmarkRunItems.id, result.itemId));
  }

  const [run] = await db.select({ id: schema.benchmarkRuns.id, totalItems: schema.benchmarkRuns.totalItems }).from(schema.benchmarkRuns).where(eq(schema.benchmarkRuns.id, runId)).limit(1);
  if (!run) return;

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.benchmarkRunItems).where(and(eq(schema.benchmarkRunItems.runId, runId), sql`${schema.benchmarkRunItems.verdict} IS NOT NULL`));

  await db.update(schema.benchmarkRuns).set({ completedItems: count }).where(eq(schema.benchmarkRuns.id, runId));

  if (count >= run.totalItems) {
    await db.update(schema.benchmarkRuns).set({ status: 'completed', completedAt: new Date() }).where(eq(schema.benchmarkRuns.id, runId));
  }
}
