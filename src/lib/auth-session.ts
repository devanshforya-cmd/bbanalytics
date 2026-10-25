import { createHmac, timingSafeEqual } from 'node:crypto';

export const AUTH_SESSION_COOKIE = 'bb_session';
export const AUTH_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

interface SessionClaims {
  sub: string;
  exp: number;
}

export function getAuthSessionSecret(): string | null {
  const secret = process.env.AUTH_SESSION_SECRET;
  return secret && Buffer.byteLength(secret) >= 32 ? secret : null;
}

export function createSessionToken(userId: string, secret: string, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, exp: Math.floor(now / 1000) + AUTH_SESSION_MAX_AGE_SECONDS })
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string, secret: string, now = Date.now()): SessionClaims | null {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;

  const expected = createHmac('sha256', secret).update(payload).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionClaims;
    if (
      typeof claims.sub !== 'string' ||
      !claims.sub ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= Math.floor(now / 1000)
    ) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
