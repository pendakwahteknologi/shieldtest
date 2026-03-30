import { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {
  findUserByUsername,
  verifyPassword,
  createSession,
  deleteSession,
  checkBruteForce,
  recordFailedAttempt,
  clearFailedAttempts,
} from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { SESSION, RATE_LIMITS } from '@shieldtest/shared';

export async function authRoutes(app: FastifyInstance) {
  // Register stricter rate limit for auth sub-routes
  await app.register(rateLimit, {
    max: RATE_LIMITS.auth.max,
    timeWindow: RATE_LIMITS.auth.timeWindow,
  });

  app.post('/auth/login', async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string };

    if (!username || !password) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Username and password are required' },
      });
    }

    const bruteCheck = checkBruteForce(username);
    if (bruteCheck.locked) {
      return reply.status(429).send({
        error: { code: 'ACCOUNT_LOCKED', message: 'Too many failed attempts. Please try again later.' },
      });
    }

    const user = await findUserByUsername(username);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      recordFailedAttempt(username);
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
      });
    }

    clearFailedAttempts(username);
    const token = await createSession(user.id);

    reply.setCookie(SESSION.cookieName, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/shieldtest',
      maxAge: SESSION.expiryHours * 60 * 60,
    });

    return { ok: true, username: user.username };
  });

  app.post('/auth/logout', { preHandler: [requireAuth] }, async (request, reply) => {
    const token = request.cookies[SESSION.cookieName];
    if (token) {
      await deleteSession(token);
    }

    reply.clearCookie(SESSION.cookieName, { path: '/shieldtest' });
    return { ok: true };
  });
}
