import type { LetterGrade } from './types.js';

export const API_BASE_PATH = '/shieldtest/api';

export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 50,
  maxLimit: 200,
} as const;

export const RATE_LIMITS = {
  auth: { max: 60, timeWindow: '1 minute' },
  api: { max: 120, timeWindow: '1 minute' },
} as const;

export const SESSION = {
  expiryHours: 24,
  cookieName: 'shieldtest_session',
} as const;

export const BRUTE_FORCE = {
  maxAttempts: 5,
  windowMinutes: 15,
  lockoutMinutes: 15,
} as const;

export function getLetterGrade(score: number): LetterGrade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}
