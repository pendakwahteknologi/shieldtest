import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireProbeAuth } from '../middleware/probe-auth.js';
import { registerProbe, updateHeartbeat, deleteProbe } from '../services/probes.js';
import { submitResults, benchmarkQueue } from '../services/benchmark.js';

export async function probeRoutes(app: FastifyInstance) {
  app.get('/probes', { preHandler: [requireAuth] }, async () => {
    const probes = await db.select({
      id: schema.probeAgents.id, name: schema.probeAgents.name,
      lastHeartbeatAt: schema.probeAgents.lastHeartbeatAt, ipAddress: schema.probeAgents.ipAddress,
      status: schema.probeAgents.status, concurrencyLimit: schema.probeAgents.concurrencyLimit,
      timeoutMs: schema.probeAgents.timeoutMs, createdAt: schema.probeAgents.createdAt,
    }).from(schema.probeAgents);
    return { data: probes };
  });

  app.post('/probes/register', { preHandler: [requireAuth] }, async (request, reply) => {
    const { name } = request.body as { name: string };
    if (!name) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Name is required' } });
    const result = await registerProbe(name);
    return { data: { probeId: result.probeId, token: result.token } };
  });

  app.delete<{ Params: { id: string } }>('/probes/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const deleted = await deleteProbe(request.params.id);
    if (!deleted) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Probe not found' } });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/probes/:id/heartbeat', { preHandler: [requireProbeAuth] }, async (request) => {
    const ip = request.headers['x-real-ip'] as string || request.ip;
    await updateHeartbeat(request.params.id, ip);
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/probes/:id/jobs', { preHandler: [requireProbeAuth] }, async (request) => {
    const job = await benchmarkQueue.getNextJob(request.params.id);
    if (!job) return { items: [] };
    const data = job.data as { runId: string; probeId: string; items: Array<{ itemId: string; hostname: string; category: string }> };
    if (data.probeId !== request.params.id) return { items: [] };
    return { jobId: job.id, runId: data.runId, items: data.items, config: { timeoutMs: 5000, doHttpCheck: true } };
  });

  app.post<{ Params: { id: string } }>('/probes/:id/results', { preHandler: [requireProbeAuth] }, async (request) => {
    const body = request.body as { jobId: string; results: Array<{ itemId: string; verdict: string; latencyMs: number; evidence: unknown }> };
    if (!body.results || body.results.length === 0) return { ok: true };
    const [item] = await db.select({ runId: schema.benchmarkRunItems.runId }).from(schema.benchmarkRunItems).where(eq(schema.benchmarkRunItems.id, body.results[0].itemId)).limit(1);
    if (item) await submitResults(item.runId, body.results);
    return { ok: true };
  });
}
