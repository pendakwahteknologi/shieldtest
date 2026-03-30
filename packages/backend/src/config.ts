import { API_BASE_PATH } from '@shieldtest/shared';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3847', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: required('DATABASE_URL'),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  sessionSecret: required('SESSION_SECRET'),
  apiBasePath: API_BASE_PATH,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
} as const;
