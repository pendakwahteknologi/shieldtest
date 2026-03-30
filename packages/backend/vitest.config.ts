import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      DATABASE_URL: 'postgresql://shieldtest:shieldtest@localhost:5432/shieldtest',
      SESSION_SECRET: 'dev-secret-key-change-in-production-1234567890abcdef',
      NODE_ENV: 'test',
    },
  },
});
