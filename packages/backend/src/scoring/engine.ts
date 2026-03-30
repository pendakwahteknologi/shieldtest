import { eq, sql, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const INFRA_VERDICTS = new Set(['TIMEOUT', 'DNS_ERROR', 'TLS_ERROR', 'NETWORK_ERROR', 'UNKNOWN']);
const BLOCKED_VERDICTS = new Set(['BLOCKED_NXDOMAIN', 'BLOCKED_SINKHOLE', 'BLOCKED_BLOCKPAGE']);

export function calculateBlockRate(items: Array<{ verdict: string | null }>): number {
  const eligible = items.filter((i) => i.verdict && !INFRA_VERDICTS.has(i.verdict));
  if (eligible.length === 0) return 0;
  const blocked = eligible.filter((i) => BLOCKED_VERDICTS.has(i.verdict!));
  return blocked.length / eligible.length;
}

export function calculateConsistencyScore(currentRates: Record<string, number>, previousRates: Record<string, number> | null): number {
  if (!previousRates) return 1.0;
  const categories = Object.keys(currentRates);
  if (categories.length === 0) return 1.0;
  let totalScore = 0;
  for (const cat of categories) {
    const delta = Math.abs((currentRates[cat] ?? 0) - (previousRates[cat] ?? 0));
    totalScore += Math.max(0, 1.0 - Math.min(delta / 0.05, 1.0));
  }
  return totalScore / categories.length;
}

export function calculateLatencyPenalty(avgLatencyMs: number): number {
  if (avgLatencyMs <= 200) return 0;
  return Math.min(((avgLatencyMs - 200) / 800), 1.0) * 5.0;
}

interface ScoreInputs { malwareBlockRate: number; phishingBlockRate: number; adultFilterRate: number; adsTrackerBlockRate: number; cleanAllowRate: number; consistencyScore: number; latencyPenalty: number; }

const DEFAULT_WEIGHTS = { malware: 0.35, phishing: 0.25, adult: 0.15, adsTracker: 0.10, clean: 0.10, consistency: 0.05 };

export function calculateOverallScore(inputs: ScoreInputs, weights = DEFAULT_WEIGHTS): number {
  const raw = weights.malware * inputs.malwareBlockRate + weights.phishing * inputs.phishingBlockRate + weights.adult * inputs.adultFilterRate + weights.adsTracker * inputs.adsTrackerBlockRate + weights.clean * inputs.cleanAllowRate + weights.consistency * inputs.consistencyScore;
  const score = raw * 100 - inputs.latencyPenalty;
  return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
}

export async function calculateAndStoreScorecard(runId: string): Promise<void> {
  const items = await db.select({ verdict: schema.benchmarkRunItems.verdict, category: schema.benchmarkRunItems.category, latencyMs: schema.benchmarkRunItems.latencyMs }).from(schema.benchmarkRunItems).where(eq(schema.benchmarkRunItems.runId, runId));

  const byCategory = new Map<string, Array<{ verdict: string | null }>>();
  let totalLatency = 0, latencyCount = 0;
  for (const item of items) {
    const list = byCategory.get(item.category) || [];
    list.push({ verdict: item.verdict });
    byCategory.set(item.category, list);
    if (item.latencyMs) { totalLatency += item.latencyMs; latencyCount++; }
  }

  const malwareBlockRate = calculateBlockRate(byCategory.get('malware') || []);
  const phishingBlockRate = calculateBlockRate(byCategory.get('phishing') || []);
  const adultFilterRate = calculateBlockRate(byCategory.get('adult') || []);
  const adsTrackerBlockRate = calculateBlockRate([...(byCategory.get('ads') || []), ...(byCategory.get('tracker') || [])]);
  const cleanItems = (byCategory.get('clean') || []).filter((i) => i.verdict && !INFRA_VERDICTS.has(i.verdict));
  const cleanAllowRate = cleanItems.length > 0 ? cleanItems.filter((i) => i.verdict === 'ALLOWED').length / cleanItems.length : 1;

  const [prevScorecard] = await db.select().from(schema.scorecards).innerJoin(schema.benchmarkRuns, eq(schema.scorecards.runId, schema.benchmarkRuns.id)).where(sql`${schema.benchmarkRuns.id} != ${runId}`).orderBy(desc(schema.scorecards.createdAt)).limit(1);

  const previousRates = prevScorecard ? { malware: prevScorecard.scorecards.malwareBlockRate ?? 0, phishing: prevScorecard.scorecards.phishingBlockRate ?? 0, adult: prevScorecard.scorecards.adultFilterRate ?? 0, adsTracker: prevScorecard.scorecards.adsTrackerBlockRate ?? 0 } : null;
  const currentRates = { malware: malwareBlockRate, phishing: phishingBlockRate, adult: adultFilterRate, adsTracker: adsTrackerBlockRate };
  const consistencyScore = calculateConsistencyScore(currentRates, previousRates);
  const latencyPenalty = calculateLatencyPenalty(latencyCount > 0 ? totalLatency / latencyCount : 0);

  const overallScore = calculateOverallScore({ malwareBlockRate, phishingBlockRate, adultFilterRate, adsTrackerBlockRate, cleanAllowRate, consistencyScore, latencyPenalty });

  await db.insert(schema.scorecards).values({ runId, malwareBlockRate, phishingBlockRate, adultFilterRate, adsTrackerBlockRate, cleanAllowRate, consistencyScore, latencyPenalty, overallScore }).onConflictDoUpdate({ target: schema.scorecards.runId, set: { malwareBlockRate, phishingBlockRate, adultFilterRate, adsTrackerBlockRate, cleanAllowRate, consistencyScore, latencyPenalty, overallScore, createdAt: new Date() } });
}
