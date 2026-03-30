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
    const body = request.body as { name: string; description?: string; sampleSizePerCategory?: number; recencyWindowDays?: number; minConfidence?: number; samplingMode?: string };
    const [profile] = await db.insert(schema.benchmarkProfiles).values({
      name: body.name, description: body.description, sampleSizePerCategory: body.sampleSizePerCategory ?? 100,
      recencyWindowDays: body.recencyWindowDays ?? 30, minConfidence: body.minConfidence ?? 50,
      samplingMode: body.samplingMode ?? 'balanced', createdBy: request.userId,
    }).returning();
    return { data: profile };
  });

  app.put<{ Params: { id: string } }>('/benchmark-profiles/:id', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const allowed = ['name', 'description', 'sampleSizePerCategory', 'recencyWindowDays', 'minConfidence', 'samplingMode'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) { if (body[key] !== undefined) updates[key] = body[key]; }
    if (Object.keys(updates).length === 0) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } });
    const [updated] = await db.update(schema.benchmarkProfiles).set(updates).where(eq(schema.benchmarkProfiles.id, request.params.id)).returning();
    if (!updated) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Profile not found' } });
    return { data: updated };
  });

  app.delete<{ Params: { id: string } }>('/benchmark-profiles/:id', async (request, reply) => {
    try {
      const result = await db.delete(schema.benchmarkProfiles).where(eq(schema.benchmarkProfiles.id, request.params.id)).returning({ id: schema.benchmarkProfiles.id });
      if (result.length === 0) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Profile not found' } });
      return { ok: true };
    } catch { return reply.status(409).send({ error: { code: 'CONFLICT', message: 'Cannot delete profile with existing runs' } }); }
  });

  app.get<{ Params: { id: string } }>('/benchmark-profiles/:id/preview', async (request, reply) => {
    try { return { data: await previewProfile(request.params.id) }; }
    catch (err) { return reply.status(404).send({ error: { code: 'NOT_FOUND', message: String(err) } }); }
  });
}
