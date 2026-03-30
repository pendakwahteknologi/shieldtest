import { FastifyInstance } from 'fastify';
import { eq, desc, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { getLetterGrade } from '@shieldtest/shared';

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/dashboard/overview', async () => {
    const [latest] = await db.select().from(schema.scorecards).innerJoin(schema.benchmarkRuns, eq(schema.scorecards.runId, schema.benchmarkRuns.id)).where(eq(schema.benchmarkRuns.status, 'completed')).orderBy(desc(schema.scorecards.createdAt)).limit(1);
    const trend = await db.select({ overallScore: schema.scorecards.overallScore, malwareBlockRate: schema.scorecards.malwareBlockRate, phishingBlockRate: schema.scorecards.phishingBlockRate, adultFilterRate: schema.scorecards.adultFilterRate, adsTrackerBlockRate: schema.scorecards.adsTrackerBlockRate, cleanAllowRate: schema.scorecards.cleanAllowRate, createdAt: schema.scorecards.createdAt, runId: schema.scorecards.runId }).from(schema.scorecards).orderBy(desc(schema.scorecards.createdAt)).limit(20);
    const [indicatorCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.indicators).where(eq(schema.indicators.isActive, true));
    const [probeCount] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.probeAgents).where(eq(schema.probeAgents.status, 'online'));
    const latestScore = latest?.scorecards?.overallScore ?? null;
    return { data: { overallScore: latestScore, letterGrade: latestScore !== null ? getLetterGrade(latestScore) : null, latestRun: latest?.benchmark_runs ?? null, trend: trend.reverse(), stats: { totalIndicators: indicatorCount.count, activeProbes: probeCount.count } } };
  });

  app.get<{ Params: { category: string } }>('/dashboard/category/:category', async (request) => {
    const { category } = request.params;
    const scorecards = await db.select({ runId: schema.scorecards.runId, malwareBlockRate: schema.scorecards.malwareBlockRate, phishingBlockRate: schema.scorecards.phishingBlockRate, adultFilterRate: schema.scorecards.adultFilterRate, adsTrackerBlockRate: schema.scorecards.adsTrackerBlockRate, cleanAllowRate: schema.scorecards.cleanAllowRate, createdAt: schema.scorecards.createdAt }).from(schema.scorecards).orderBy(desc(schema.scorecards.createdAt)).limit(20);
    const rateKey: Record<string, string> = { malware: 'malwareBlockRate', phishing: 'phishingBlockRate', adult: 'adultFilterRate', ads: 'adsTrackerBlockRate', tracker: 'adsTrackerBlockRate', clean: 'cleanAllowRate' };
    const key = rateKey[category] || 'malwareBlockRate';
    const trend = scorecards.reverse().map((sc) => ({ runId: sc.runId, rate: (sc as Record<string, unknown>)[key] as number, createdAt: sc.createdAt }));
    return { data: { category, trend } };
  });
}
