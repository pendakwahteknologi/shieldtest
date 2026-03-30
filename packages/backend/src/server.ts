import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { RATE_LIMITS } from '@shieldtest/shared';

const app = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
    transport: config.nodeEnv !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
  },
});

// Plugins
await app.register(cors, {
  origin: config.nodeEnv === 'production'
    ? false // Same-origin in production
    : config.frontendUrl,
  credentials: true,
});

await app.register(cookie, {
  secret: config.sessionSecret,
});

// Global rate limit (API default)
await app.register(rateLimit, {
  max: RATE_LIMITS.api.max,
  timeWindow: RATE_LIMITS.api.timeWindow,
});

// Routes
await app.register(healthRoutes, { prefix: config.apiBasePath });
await app.register(authRoutes, { prefix: config.apiBasePath });

// Start
const start = async () => {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`ShieldTest backend listening on port ${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
