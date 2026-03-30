import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  checkBruteForce,
  recordFailedAttempt,
  clearFailedAttempts,
} from '../auth.js';

describe('password hashing', () => {
  it('should hash and verify a password', async () => {
    const hash = await hashPassword('test-password-123');
    expect(hash).not.toBe('test-password-123');
    expect(await verifyPassword('test-password-123', hash)).toBe(true);
  });

  it('should reject wrong password', async () => {
    const hash = await hashPassword('correct-password');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});

describe('brute-force protection', () => {
  beforeEach(() => {
    clearFailedAttempts('testuser');
  });

  it('should not lock after fewer than 5 attempts', () => {
    for (let i = 0; i < 4; i++) {
      recordFailedAttempt('testuser');
    }
    expect(checkBruteForce('testuser').locked).toBe(false);
  });

  it('should lock after 5 failed attempts', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt('testuser');
    }
    expect(checkBruteForce('testuser').locked).toBe(true);
    expect(checkBruteForce('testuser').retryAfterMs).toBeGreaterThan(0);
  });

  it('should not affect other usernames', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt('testuser');
    }
    expect(checkBruteForce('otheruser').locked).toBe(false);
  });

  it('should unlock after clearing attempts', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt('testuser');
    }
    clearFailedAttempts('testuser');
    expect(checkBruteForce('testuser').locked).toBe(false);
  });
});
