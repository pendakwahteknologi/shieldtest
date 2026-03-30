import { FastifyRequest, FastifyReply } from 'fastify';
import { validateProbeToken } from '../services/probes.js';

declare module 'fastify' {
  interface FastifyRequest {
    probeId?: string;
  }
}

export async function requireProbeAuth(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Probe token required' } });
    return;
  }
  const token = authHeader.slice(7);
  const probeId = (request.params as { id?: string }).id;
  if (!probeId) {
    reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Probe ID required' } });
    return;
  }
  const valid = await validateProbeToken(probeId, token);
  if (!valid) {
    reply.status(401).send({ error: { code: 'INVALID_TOKEN', message: 'Invalid probe token for this probe ID' } });
    return;
  }
  request.probeId = probeId;
}
