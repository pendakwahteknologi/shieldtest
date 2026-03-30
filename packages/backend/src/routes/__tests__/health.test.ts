import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';

// Mock the db module to avoid needing a real DB connection in unit tests
vi.mock('../../db/index.js', () => ({
  db: {
    execute: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}));

import { healthRoutes } from '../health.js';

describe('GET /health', () => {
  it('should return status ok when DB is reachable', async () => {
    const app = Fastify();
    await app.register(healthRoutes, { prefix: '/shieldtest/api' });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/shieldtest/api/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('uptime');
    expect(body.checks.database).toBe('ok');
  });
});
