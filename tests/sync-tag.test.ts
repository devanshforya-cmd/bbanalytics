import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeDatabase } from './fake-supabase.ts';
import { setTestDatabaseClient } from '../src/lib/db/supabase-server.ts';
import { createSessionToken, AUTH_SESSION_COOKIE } from '../src/lib/auth-session.ts';
import { saveWorkspaceMutation } from '../src/lib/db/server-workspace.ts';

process.env.AUTH_SESSION_SECRET = 'test-secret-that-is-long-enough-for-hmac-signing-0123456789';
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';
const admin: any = { id: 'admin', fullName: 'Devansh', role: 'SUPER_ADMIN', isSuperAdmin: true, active: true, assignedBrands: ['ALL'], permissions: {}, customPermissions: {} };

test('a refresh with nothing new is answered "unchanged"; any change sends everything again', async () => {
  const db = new FakeDatabase();
  db.tables.users = [{ id: 'admin', full_name: 'Devansh', role: 'SUPER_ADMIN', is_super_admin: true, is_active: true, assigned_brands: ['ALL'], custom_permissions: {}, permissions: {} }];
  db.tables.brands = [{ id: 'b1', code: 'FORYA', name: 'Forya', is_active: true }];
  db.seed('tasks', { id: 't1', title: 'Count stock', status: 'PENDING' });
  setTestDatabaseClient(db as any);
  const { GET } = await import('../src/app/api/sync/route.ts');
  const cookie = `${AUTH_SESSION_COOKIE}=${createSessionToken('admin', process.env.AUTH_SESSION_SECRET!)}`;
  const get = async (tag?: string) => (await GET(new Request('http://localhost/api/sync', { headers: { cookie, 'x-workspace-epoch': 'initial', ...(tag ? { 'x-workspace-tag': tag } : {}) } }))).json();

  const first = await get();
  assert.equal(first.success, true, JSON.stringify(first).slice(0, 200));
  assert.ok(first.data.tasks.length === 1 && typeof first.tag === 'string');
  const again = await get(first.tag);
  assert.equal(again.unchanged, true);
  assert.equal(again.data, undefined, 'nothing is sent when nothing moved');
  assert.equal((await get('stale')).unchanged, undefined);

  await saveWorkspaceMutation(admin, { collection: 'tasks', id: 't1', operation: 'upsert', data: { id: 't1', title: 'Count stock', status: 'COMPLETED' }, expectedVersion: 1, mutationId: 'mutation_test_1' } as any);
  const after = await get(first.tag);
  assert.equal(after.unchanged, undefined);
  assert.equal(after.data.tasks[0].status, 'COMPLETED');
  assert.notEqual(after.tag, first.tag);
});
