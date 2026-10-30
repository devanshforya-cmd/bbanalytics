import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { validatePushSubscription, safeNotificationPath } from '../src/lib/push-validation.ts';
import * as permissions from '../src/lib/permissions.ts';

const key = createECDH('prime256v1'); key.generateKeys();
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test-only', keys: { p256dh: key.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
test('push subscription rejects internal hosts, credentials, wrong protocols and invalid encryption points', () => {
  assert.deepEqual(validatePushSubscription(subscription), subscription);
  for (const endpoint of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com.attacker.test/x', 'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com:444/x', 'https://example.com/x']) assert.throws(() => validatePushSubscription({ ...subscription, endpoint }));
  assert.throws(() => validatePushSubscription({ ...subscription, keys: { ...subscription.keys, auth: 'fake' } }));
  assert.throws(() => validatePushSubscription({ ...subscription, keys: { ...subscription.keys, p256dh: Buffer.alloc(65, 4).toString('base64url') } }));
});
test('notification click paths cannot redirect to an outside origin', () => {
  for (const value of ['https://outside.test', '//outside.test', '/\\outside.test', '/\nhttps://outside.test', null]) assert.equal(safeNotificationPath(value), '/');
  assert.equal(safeNotificationPath('/offline-sales/beat-plan'), '/offline-sales/beat-plan');
});

function pushServerHarness() {
  const deliveries = new Map<string, { state: string; updated_at: string }>();
  const rows = [{ id: 'device1', subscription, created_at: '2026-01-01T00:00:00Z' }];
  let calls = 0, transportStatus = 201;
  const database = { from(table: string) {
    const filters: Record<string, any> = {}; let action = 'select', payload: any;
    const query: any = {
      select() { return query; }, eq(name: string, value: unknown) { filters[name] = value; return query; }, lt() { return query; },
      insert(value: unknown) { action = 'insert'; payload = value; return query; }, update(value: unknown) { action = 'update'; payload = value; return query; }, delete() { action = 'delete'; return query; },
      then(resolve: (value: unknown) => unknown) {
        if (table === 'push_subscriptions') return Promise.resolve({ data: rows, error: null }).then(resolve);
        const id = `${payload?.notification_id || filters.notification_id}:${payload?.subscription_id || filters.subscription_id}`;
        const prior = deliveries.get(id);
        if (action === 'insert') {
          if (prior) return Promise.resolve({ data: null, error: { code: '23505' } }).then(resolve);
          deliveries.set(id, payload);
        } else if (action === 'update') {
          if (!prior || filters.state && prior.state !== filters.state) return Promise.resolve({ data: [], error: null }).then(resolve);
          deliveries.set(id, { ...prior, ...payload });
        }
        return Promise.resolve({ data: [{ notification_id: id }], error: null }).then(resolve);
      },
    }; return query;
  } };
  const dependencies: Record<string, unknown> = {
    'web-push': { async sendNotification() { calls++; if (transportStatus >= 400) throw { statusCode: transportStatus }; return { statusCode: transportStatus }; } },
    'node:crypto': { createHash: (awaitImportCrypto as any).createHash },
    '@/lib/db/supabase-server': { supabaseAdmin: database }, '@/lib/permissions': permissions,
    './push-validation': { validatePushSubscription, safeNotificationPath },
  };
  const module = { exports: {} as any };
  const source = ts.transpileModule(readFileSync(new URL('../src/lib/push-server.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', 'process', source)((id: string) => { if (!(id in dependencies)) throw new Error(id); return dependencies[id]; }, module, module.exports, { env: { VAPID_PUBLIC_KEY: 'public', VAPID_PRIVATE_KEY: 'private', VAPID_SUBJECT: 'https://bb.example' } });
  return { server: module.exports, get calls() { return calls; }, deliveries, fail() { transportStatus = 503; } };
}
import * as awaitImportCrypto from 'node:crypto';
const officer = { id: 'a', role: 'SALES_OFFICER', active: true, customPermissions: { tasks: { access: 'FULL', actions: ['VIEW'], scope: 'OWN' } } };
const notification = { id: 'notice1', userId: 'a', entityType: 'tasks', priority: 'HIGH', read: false, createdAt: '2026-10-29T00:00:00Z' };
test('a persisted delivery claim prevents duplicate pushes for the same notification and device', async () => {
  const h = pushServerHarness();
  assert.deepEqual(await h.server.deliverPushNotification(officer, notification), { sent: 1, failed: 0 });
  assert.deepEqual(await h.server.deliverPushNotification(officer, notification), { sent: 0, failed: 0 });
  assert.equal(h.calls, 1);
});
test('inactive accounts and removed feature grants do not receive pushes', async () => {
  const h = pushServerHarness();
  await h.server.deliverPushNotification({ ...officer, active: false }, notification);
  await h.server.deliverPushNotification({ ...officer, customPermissions: { tasks: { access: 'HIDDEN' } } }, notification);
  await h.server.deliverPushNotification(officer, { ...notification, userId: 'someone-else' });
  assert.equal(h.calls, 0);
});
test('provider failures are recorded for a later retry instead of acknowledged as delivered', async () => {
  const h = pushServerHarness(); h.fail();
  assert.deepEqual(await h.server.deliverPushNotification(officer, notification), { sent: 0, failed: 1 });
  assert.equal(h.deliveries.get('notice1:device1')?.state, 'failed');
});
