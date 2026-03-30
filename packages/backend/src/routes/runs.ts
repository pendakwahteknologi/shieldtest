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
    if (query.status) baseQuery = baseQuery.where(eq(schema.benchmarkRuns.status, query.status)) as typeof baseQuery;
    const runs = await baseQuery.orderBy(desc(schema.benchmarkRuns.createdAt)).limit(limit).offset(offset);
    return { data: runs, pagination: { page, limit } };
  });

  app.post('/runs', async (request, reply) => {
    const body = request.body as { profileId: string; probeId: string; routerName?: string; firmwareVersion?: string; resolverMode?: string; notes?: string };
    if (!body.profileId || !body.probeId) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'profileId and probeId are required' } });
    try { return { data: await createRun({ ...body, createdBy: request.userId }) }; }
    catch (err) { return reply.status(400).send({ error: { code: 'RUN_ERROR', message: String(err) } }); }
  });

  app.get<{ Params: { id: string } }>('/runs/:id', async (request, reply) => {
    const [run] = await db.select().from(schema.benchmarkRuns).where(eq(schema.benchmarkRuns.id, request.params.id)).limit(1);
    if (!run) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    return { data: run };
  });

  app.get<{ Params: { id: string } }>('/runs/:id/results', async (request) => {
    const query = request.query as { page?: string; limit?: string; category?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(PAGINATION_DEFAULTS.maxLimit, Math.max(1, parseInt(query.limit || String(PAGINATION_DEFAULTS.limit), 10)));
    const offset = (page - 1) * limit;

    const conditions = [eq(schema.benchmarkRunItems.runId, request.params.id)];
    if (query.category) conditions.push(eq(schema.benchmarkRunItems.category, query.category));

    const items = await db.select().from(schema.benchmarkRunItems).where(and(...conditions)).limit(limit).offset(offset);
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.benchmarkRunItems).where(eq(schema.benchmarkRunItems.runId, request.params.id));
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
