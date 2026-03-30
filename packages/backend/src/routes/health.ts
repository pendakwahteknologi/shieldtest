import { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    let dbStatus = 'ok';
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbStatus = 'error';
    }

    const status = dbStatus === 'ok' ? 'ok' : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      checks: { database: dbStatus },
    };
  });
}
