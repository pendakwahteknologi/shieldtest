import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function registerProbe(name: string): Promise<{ probeId: string; token: string }> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const [probe] = await db.insert(schema.probeAgents).values({ name, tokenHash, status: 'offline' }).returning({ id: schema.probeAgents.id });
  return { probeId: probe.id, token };
}

export async function validateProbeToken(probeId: string, token: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const [probe] = await db.select({ id: schema.probeAgents.id }).from(schema.probeAgents).where(and(eq(schema.probeAgents.id, probeId), eq(schema.probeAgents.tokenHash, tokenHash))).limit(1);
  return !!probe;
}

export async function updateHeartbeat(probeId: string, ipAddress?: string): Promise<void> {
  await db.update(schema.probeAgents).set({ lastHeartbeatAt: new Date(), ipAddress: ipAddress ?? null, status: 'online' }).where(eq(schema.probeAgents.id, probeId));
}

export async function deleteProbe(probeId: string): Promise<boolean> {
  const result = await db.delete(schema.probeAgents).where(eq(schema.probeAgents.id, probeId)).returning({ id: schema.probeAgents.id });
  return result.length > 0;
}
