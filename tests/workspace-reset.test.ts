import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceEpochMatches, isWorkspaceStorageKey } from '../src/lib/workspace-reset';
import { DatabaseService } from '../src/lib/db/db-service';
test('reset rejects old clients and blocks current clients during cleanup', () => {
  assert.equal(workspaceEpochMatches(null, { epoch: 'fresh', resetting: false }), false);
  assert.equal(workspaceEpochMatches('old', { epoch: 'fresh', resetting: false }), false);
  assert.equal(workspaceEpochMatches('fresh', { epoch: 'fresh', resetting: true }), false);
  assert.equal(workspaceEpochMatches('fresh', { epoch: 'fresh', resetting: false }), true);
});
test('reset clears all app storage namespaces without touching unrelated apps', () => {
  for (const key of ['bb_auth_user_session_v3', 'bb_workspace_queue_v1:admin', 'bb_queue_backup:admin:1', 'bb_command_center_offline_queue', 'brand-bucket-draft']) assert.equal(isWorkspaceStorageKey(key), true, key);
  assert.equal(isWorkspaceStorageKey('unrelated-app'), false);
});
test('fresh workspace has no seeded users, catalogue, store or configuration records', () => {
  const db = new DatabaseService({ server: true });
  assert.deepEqual(db.getUsers(), []); assert.deepEqual(db.getBrands(), []);
  for (const [collection, rows] of Object.entries(db.exportSnapshot())) if (collection !== 'workspaceConfig') assert.deepEqual(rows, [], collection);
});

test('browser reset erases caches before an old request can be transmitted', async () => {
  const { installWorkspaceFetch } = await import('../src/lib/workspace-reset-client');
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const oldSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const oldIndexed = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const storage = (data: Record<string, string>) => {
    const target: any = { ...data };
    Object.defineProperties(target, { getItem: { value: (key: string) => target[key] ?? null }, setItem: { value: (key: string, value: string) => { target[key] = value; } }, removeItem: { value: (key: string) => { delete target[key]; } } });
    return target;
  };
  const local = storage({ bb_workspace_epoch: 'old', 'bb_workspace_queue_v1:admin': '[old records]', bb_auth_user_session_v3: 'old session', unrelated: 'keep' });
  const session = storage({ bb_draft_store: 'old draft' });
  const calls: string[] = []; let destination = '';
  const fakeWindow: any = { fetch: async (url: string) => { calls.push(url); return Response.json({ epoch: 'fresh', resetting: false }); }, addEventListener() {}, dispatchEvent() {}, location: { origin: 'https://app.example.test', replace: (url: string) => { destination = url; } } };
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: session });
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { deleteDatabase: () => ({}) } });
    installWorkspaceFetch();
    await assert.rejects(fakeWindow.fetch('/api/sync', { method: 'POST', body: 'old records' }), /reset|reloading/i);
    assert.deepEqual(calls, ['/api/workspace-state']);
    assert.equal(destination, '/login'); assert.equal(local.unrelated, 'keep');
    assert.equal(local.bb_workspace_epoch, 'fresh');
    assert.equal(local['bb_workspace_queue_v1:admin'], undefined); assert.equal(session.bb_draft_store, undefined);
  } finally {
    for (const [key, descriptor] of [['window', oldWindow], ['localStorage', oldLocal], ['sessionStorage', oldSession], ['indexedDB', oldIndexed]] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key];
    }
  }
});
