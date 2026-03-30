import { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { triggerManualSync } from '../queue/sync-scheduler.js';
import { PAGINATION_DEFAULTS } from '@shieldtest/shared';

export async function sourceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/sources', async () => {
    const sources = await db
      .select()
      .from(schema.sources)
      .orderBy(schema.sources.name);

    return { data: sources };
  });

  app.put<{ Params: { id: string } }>('/sources/:id', async (request, reply) => {
    const { id } = request.params;
    const body = request.body as { enabled?: boolean; refreshIntervalMins?: number };

    const updates: Record<string, unknown> = {};
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.refreshIntervalMins !== undefined) updates.refreshIntervalMins = body.refreshIntervalMins;

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' },
      });
    }

    const [updated] = await db
      .update(schema.sources)
      .set(updates)
      .where(eq(schema.sources.id, id))
      .returning();

    if (!updated) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Source not found' },
      });
    }

    return { data: updated };
  });

  app.post<{ Params: { id: string } }>('/sources/:id/sync', async (request, reply) => {
    const { id } = request.params;

    try {
      const jobId = await triggerManualSync(id);
      return { ok: true, jobId };
    } catch (err) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: String(err) },
      });
    }
  });

  app.get('/sources/sync-runs', async (request) => {
    const query = request.query as { page?: string; limit?: string; sourceId?: string };
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(
      PAGINATION_DEFAULTS.maxLimit,
      Math.max(1, parseInt(query.limit || String(PAGINATION_DEFAULTS.limit), 10)),
    );
    const offset = (page - 1) * limit;

    let baseQuery = db.select().from(schema.sourceSyncRuns);

    if (query.sourceId) {
      baseQuery = baseQuery.where(eq(schema.sourceSyncRuns.sourceId, query.sourceId)) as typeof baseQuery;
    }

    const runs = await baseQuery
      .orderBy(desc(schema.sourceSyncRuns.startedAt))
      .limit(limit)
      .offset(offset);

    return {
      data: runs,
      pagination: { page, limit },
    };
  });

  app.get('/indicators/stats', async () => {
    const stats = await db
      .select({
        category: schema.indicators.category,
      })
      .from(schema.indicators)
      .where(eq(schema.indicators.isActive, true));

    const counts: Record<string, number> = {};
    for (const row of stats) {
      counts[row.category] = (counts[row.category] || 0) + 1;
    }

    return { data: counts };
  });
}
