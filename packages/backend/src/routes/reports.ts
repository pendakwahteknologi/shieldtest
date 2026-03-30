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
    const rows = items.map((i) => `"${i.hostname}","${i.category}","${i.verdict || ''}",${i.latencyMs || ''},"${i.testedAt || ''}"`).join('\n');
    return header + rows;
  });
}
