/**
 * 56h. Rate Limiting for Login & Sensitive Endpoints
 * In-memory sliding window rate limiter
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, RateLimitRecord>();

export const RATE_LIMIT_MAX_ATTEMPTS = 5;
export const RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export function rateLimitCheck(identifier: string): {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const record = attempts.get(identifier);

  // Clean up expired records
  if (record && now > record.resetAt) {
    attempts.delete(identifier);
  }

  const current = attempts.get(identifier);

  if (current && current.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  const remaining = Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - (current?.count || 0));

  return {
    allowed: true,
    remaining,
  };
}

export function rateLimitRecordFailure(identifier: string): {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const current = attempts.get(identifier);
  const newCount = (current?.count || 0) + 1;
  const resetAt = current?.resetAt || now + RATE_LIMIT_LOCKOUT_MS;

  attempts.set(identifier, {
    count: newCount,
    resetAt,
  });

  const remaining = Math.max(0, RATE_LIMIT_MAX_ATTEMPTS - newCount);
  return {
    allowed: newCount < RATE_LIMIT_MAX_ATTEMPTS,
    remaining,
    retryAfterSeconds: newCount >= RATE_LIMIT_MAX_ATTEMPTS ? Math.ceil(RATE_LIMIT_LOCKOUT_MS / 1000) : undefined,
  };
}

export function rateLimitReset(identifier: string): void {
  attempts.delete(identifier);
}

export function rateLimitClearAll(): void {
  attempts.clear();
}

export function rateLimitGetStatus(identifier: string): {
  isLocked: boolean;
  attemptsCount: number;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const record = attempts.get(identifier);
  if (!record || now > record.resetAt) {
    return { isLocked: false, attemptsCount: 0, retryAfterSeconds: 0 };
  }
  const isLocked = record.count >= RATE_LIMIT_MAX_ATTEMPTS;
  const retryAfterSeconds = isLocked ? Math.max(1, Math.ceil((record.resetAt - now) / 1000)) : 0;
  return {
    isLocked,
    attemptsCount: record.count,
    retryAfterSeconds,
  };
}
