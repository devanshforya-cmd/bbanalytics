import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken, verifySessionToken, AUTH_SESSION_MAX_AGE_SECONDS } from '../src/lib/auth-session.ts';
import { requireAuth } from '../src/lib/auth-guard.ts';
import { requireCronAuth } from '../src/lib/cron-auth.ts';
import { assertSyncSuccess } from '../src/lib/offline-sync.ts';

test('Session tokens are signed, expire after 24 hours, and reject tampering', () => {
  const secret = 'test-session-secret-with-at-least-32-bytes';
  const now = 1_800_000_000_000;
  const token = createSessionToken('user-123', secret, now);

  assert.deepEqual(verifySessionToken(token, secret, now), {
    sub: 'user-123',
    exp: Math.floor(now / 1000) + AUTH_SESSION_MAX_AGE_SECONDS,
  });
  assert.equal(verifySessionToken(token, 'different-session-secret-with-32-bytes', now), null);
  assert.equal(verifySessionToken(`${token.slice(0, -1)}x`, secret, now), null);
  assert.equal(verifySessionToken(token, secret, now + AUTH_SESSION_MAX_AGE_SECONDS * 1000 + 1), null);
});

test('API auth rejects caller-supplied user IDs and bearer IDs', async () => {
  const prior = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    secret: process.env.AUTH_SESSION_SECRET,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';
  process.env.AUTH_SESSION_SECRET = 'test-session-secret-with-at-least-32-bytes';

  try {
    const userHeader = await requireAuth(new Request('https://example.test/api/orders', {
      headers: { 'x-user-id': 'user_devansh' },
    }));
    const bearerHeader = await requireAuth(new Request('https://example.test/api/orders', {
      headers: { Authorization: 'Bearer user_devansh' },
    }));
    assert.equal(userHeader.response?.status, 401);
    assert.equal(bearerHeader.response?.status, 401);
  } finally {
    if (prior.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prior.url;
    if (prior.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prior.key;
    if (prior.secret === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = prior.secret;
  }
});

test('Cron endpoints fail closed without a configured secret', () => {
  const prior = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const response = requireCronAuth(new Request('https://example.test/api/cron/daily-check'));
    assert.equal(response?.status, 503);
  } finally {
    if (prior === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prior;
  }
});

test('Offline sync only acknowledges successful writes', () => {
  assert.doesNotThrow(() => assertSyncSuccess({ error: null }, 'ORDER_CREATED'));
  assert.throws(() => assertSyncSuccess({ error: { message: 'row-level security denied' } }, 'ORDER_CREATED'), /row-level security denied/);
});
