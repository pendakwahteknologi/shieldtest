import { FastifyRequest, FastifyReply } from 'fastify';
import { validateSession } from '../services/auth.js';
import { SESSION } from '@shieldtest/shared';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[SESSION.cookieName];

  if (!token) {
    reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } });
    return;
  }

  const userId = await validateSession(token);
  if (!userId) {
    reply.status(401).send({ error: { code: 'SESSION_EXPIRED', message: 'Session expired, please log in again' } });
    return;
  }

  request.userId = userId;
}
