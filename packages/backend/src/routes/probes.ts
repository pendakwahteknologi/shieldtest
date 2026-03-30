import { FastifyInstance } from 'fastify';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { requireProbeAuth } from '../middleware/probe-auth.js';
import { registerProbe, updateHeartbeat, deleteProbe } from '../services/probes.js';
import { submitResults } from '../services/benchmark.js';

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
    // Find a running benchmark run assigned to this probe with untested items
    const [run] = await db
      .select({ id: schema.benchmarkRuns.id })
      .from(schema.benchmarkRuns)
      .where(and(
        eq(schema.benchmarkRuns.probeId, request.params.id),
        eq(schema.benchmarkRuns.status, 'running'),
      ))
      .limit(1);

    if (!run) return { items: [] };

    // Get up to 50 untested items from this run
    const items = await db
      .select({
        id: schema.benchmarkRunItems.id,
        hostname: schema.benchmarkRunItems.hostname,
        category: schema.benchmarkRunItems.category,
      })
      .from(schema.benchmarkRunItems)
      .where(and(
        eq(schema.benchmarkRunItems.runId, run.id),
        isNull(schema.benchmarkRunItems.verdict),
      ))
      .limit(50);

    if (items.length === 0) return { items: [] };

    return {
      jobId: `job-${run.id}-${Date.now()}`,
      runId: run.id,
      items: items.map((i) => ({ itemId: i.id, hostname: i.hostname, category: i.category })),
      config: { timeoutMs: 5000, doHttpCheck: false },
    };
  });

  app.post<{ Params: { id: string } }>('/probes/:id/results', { preHandler: [requireProbeAuth] }, async (request) => {
    const body = request.body as { jobId: string; results: Array<{ itemId: string; verdict: string; latencyMs: number; evidence: unknown }> };
    if (!body.results || body.results.length === 0) return { ok: true };
    const [item] = await db.select({ runId: schema.benchmarkRunItems.runId }).from(schema.benchmarkRunItems).where(eq(schema.benchmarkRunItems.id, body.results[0].itemId)).limit(1);
    if (item) await submitResults(item.runId, body.results);
    return { ok: true };
  });
}
