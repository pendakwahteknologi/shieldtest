import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { SESSION, BRUTE_FORCE } from '@shieldtest/shared';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + SESSION.expiryHours);

  await db.insert(schema.sessions).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return token;
}

export async function validateSession(token: string): Promise<string | null> {
  const tokenHash = hashToken(token);

  const [session] = await db
    .select({ userId: schema.sessions.userId, expiresAt: schema.sessions.expiresAt })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.tokenHash, tokenHash),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return session?.userId ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash));
}

export async function findUserByUsername(username: string) {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .limit(1);

  return user ?? null;
}

// Brute-force tracking (in-memory, resets on restart — acceptable for small team)
const failedAttempts = new Map<string, { count: number; firstAttempt: number }>();

export function checkBruteForce(username: string): { locked: boolean; retryAfterMs?: number } {
  const record = failedAttempts.get(username);
  if (!record) return { locked: false };

  const windowMs = BRUTE_FORCE.windowMinutes * 60 * 1000;
  const lockoutMs = BRUTE_FORCE.lockoutMinutes * 60 * 1000;
  const now = Date.now();

  if (now - record.firstAttempt > windowMs + lockoutMs) {
    failedAttempts.delete(username);
    return { locked: false };
  }

  if (record.count >= BRUTE_FORCE.maxAttempts) {
    const unlockAt = record.firstAttempt + windowMs + lockoutMs;
    if (now < unlockAt) {
      return { locked: true, retryAfterMs: unlockAt - now };
    }
    failedAttempts.delete(username);
    return { locked: false };
  }

  return { locked: false };
}

export function recordFailedAttempt(username: string): void {
  const record = failedAttempts.get(username);
  const now = Date.now();

  if (!record) {
    failedAttempts.set(username, { count: 1, firstAttempt: now });
  } else {
    record.count += 1;
  }
}

export function clearFailedAttempts(username: string): void {
  failedAttempts.delete(username);
}
