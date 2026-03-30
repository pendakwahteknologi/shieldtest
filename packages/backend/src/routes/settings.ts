import { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/settings', async () => {
    const settings = await db.select().from(schema.appSettings);
    const result: Record<string, unknown> = {};
    for (const s of settings) result[s.key] = s.valueJson;
    return { data: result };
  });

  app.put('/settings', async (request) => {
    const body = request.body as Record<string, unknown>;
    for (const [key, value] of Object.entries(body)) {
      await db.insert(schema.appSettings).values({ key, valueJson: value, updatedAt: new Date() }).onConflictDoUpdate({ target: schema.appSettings.key, set: { valueJson: value, updatedAt: new Date() } });
    }
    return { ok: true };
  });
}
