import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseService, DEFAULT_SUPER_ADMIN, db as coreDb } from '../src/lib/db/db-service.ts';
import { OfflineSyncManager, syncManager } from '../src/lib/offline-sync.ts';
import { fetchLatestPingsFromSupabase } from '../src/lib/db/gps-service.ts';
import type { WorkspaceMutation } from '../src/lib/db/workspace-types.ts';

class MemoryStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] || null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function mockGlobals(t: any, values: Record<string, unknown>) {
  const descriptors = Object.fromEntries(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  t.after(() => {
    syncManager.setUser(null);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as any)[key];
    }
  });
}
const mutation = (id: string, name: string, expectedVersion = 0): WorkspaceMutation => ({ collection: 'products', id, operation: 'upsert', data: { id, name }, expectedVersion, mutationId: `mutation-${name}` });
const ok = (version: number) => Response.json({ success: true, version });

test('server hydration captures row changes and deletions without queueing hydration or local preferences', () => {
  const db = new DatabaseService({ server: true });
  db.hydrateSnapshot({ products: [{ id: 'p1', name: 'Original', sku: 'P1', brandCode: 'BRAND' }] }, DEFAULT_SUPER_ADMIN, { products: { p1: 4 } });
  assert.deepEqual(db.getPendingMutations(), []);
  db.setActiveBrandFilter('BRAND'); db.setCalendarMode('AD'); db.setComparisonMode('OFF'); db.setSalesMode('ALL');
  assert.deepEqual(db.getPendingMutations(), []);
  db.updateProduct('p1', { name: 'Edited' }); db.updateProduct('p1', { name: 'Latest' });
  assert.equal(db.getPendingMutations().length, 1);
  assert.equal(db.getPendingMutations()[0].data?.name, 'Latest');
  assert.equal(db.getPendingMutations()[0].expectedVersion, 4);
  db.deleteProduct('p1');
  assert.equal(db.getPendingMutations()[0].operation, 'delete');
  assert.equal(db.getPendingMutations()[0].expectedVersion, 4);
  db.hydrateSnapshot({ products: [{ id: 'p2', name: 'Remote' }] }, DEFAULT_SUPER_ADMIN);
  assert.deepEqual(db.getPendingMutations(), []);
  assert.equal(db.exportSnapshot().products?.[0].id, 'p2');
});

test('snapshots include indirect store balance changes, activity, workspace config and location ids', () => {
  const db = new DatabaseService({ server: true });
  db.hydrateSnapshot({ retailers: [{ id: 'r1', outstandingBalance: 10 }] }, DEFAULT_SUPER_ADMIN);
  db.createSecondaryOrder({ entityType: 'RETAILER', entityId: 'r1', totalAmount: 25, totalUnits: 1, items: [], storeName: 'Shop' } as any);
  db.setRequireStorePhotoAtCheckIn(true);
  db.updateStaffPing('officer1', 27, 85, 'AT_STORE');
  const changes = db.getPendingMutations();
  assert.equal(changes.find((row) => row.collection === 'retailers')?.data?.outstandingBalance, 35);
  assert.ok(changes.some((row) => row.collection === 'secondaryOrders'));
  assert.ok(!changes.some((row) => row.collection === 'activityLogs'));
  assert.ok(db.exportSnapshot().activityLogs?.length);
  assert.equal(changes.find((row) => row.collection === 'workspaceConfig')?.data?.requireStorePhotoAtCheckIn, true);
  assert.ok(!changes.some((row) => row.collection === 'staffLiveLocations'));
  assert.equal(db.exportSnapshot().staffLiveLocations?.[0].id, 'officer1');
});

test('queue preserves changes enqueued during a request and rebases their expected version', async (t) => {
  const storage = new MemoryStorage();
  let resolveFirst!: (response: Response) => void;
  let started!: () => void;
  const requestStarted = new Promise<void>((resolve) => { started = resolve; });
  const requests: WorkspaceMutation[] = [];
  mockGlobals(t, { localStorage: storage, fetch: async (_url: string, options: RequestInit) => {
    requests.push(JSON.parse(String(options.body)));
    if (requests.length === 1) return new Promise<Response>((resolve) => { resolveFirst = resolve; started(); });
    return ok(2);
  } });
  const manager = new OfflineSyncManager(); manager.setUser('alice');
  manager.enqueue('WORKSPACE_MUTATION', mutation('p1', 'first') as any);
  const firstRun = manager.triggerSync();
  await requestStarted;
  manager.enqueue('WORKSPACE_MUTATION', mutation('p1', 'second') as any);
  resolveFirst(ok(1)); await firstRun;
  assert.equal(manager.getPendingCount(), 1);
  assert.equal(manager.getWorkspaceMutations()[0].data?.name, 'second');
  assert.equal(manager.getWorkspaceMutations()[0].expectedVersion, 1);
  await manager.triggerSync();
  assert.equal(requests[1].expectedVersion, 1);
  assert.equal(manager.getPendingCount(), 0);
});

test('Force Sync pushes pending records before refreshing, and coalesces unsent record edits', async (t) => {
  const calls: string[] = [];
  mockGlobals(t, { localStorage: new MemoryStorage(), fetch: async () => { calls.push('push'); return ok(1); } });
  const manager = new OfflineSyncManager(); manager.setUser('alice');
  manager.setRefreshHandler(async () => { calls.push('pull'); return { success: true }; });
  manager.enqueue('WORKSPACE_MUTATION', mutation('p1', 'first', 3) as any);
  manager.enqueue('WORKSPACE_MUTATION', mutation('p1', 'latest', 99) as any);
  assert.equal(manager.getPendingCount(), 1);
  assert.equal(manager.getWorkspaceMutations()[0].expectedVersion, 3);
  await manager.forceSyncNow();
  assert.deepEqual(calls, ['push', 'pull']);
});

test('conflicts remain durable and require explicit review before retry', async (t) => {
  let requests = 0;
  mockGlobals(t, { localStorage: new MemoryStorage(), fetch: async () => { requests++; return Response.json({ success: false, currentVersion: 8, error: 'Changed' }, { status: 409 }); } });
  const manager = new OfflineSyncManager(); manager.setUser('alice');
  manager.enqueue('WORKSPACE_MUTATION', mutation('p1', 'local', 4) as any);
  await manager.forceSyncNow(); await manager.forceSyncNow();
  assert.equal(requests, 1);
  assert.equal(manager.getPendingCount(), 1);
  assert.match(manager.getErrors()[0], /review the conflict/);
  manager.retryConflict(manager.getQueue()[0].id);
  assert.equal(manager.getWorkspaceMutations()[0].expectedVersion, 8);
});

test('account switching isolates queues and a previous account response cannot change the new queue', async (t) => {
  const storage = new MemoryStorage();
  let resolveRequest!: (response: Response) => void;
  let started!: () => void;
  const requestStarted = new Promise<void>((resolve) => { started = resolve; });
  mockGlobals(t, { localStorage: storage, fetch: async () => new Promise<Response>((resolve) => { resolveRequest = resolve; started(); }) });
  const manager = new OfflineSyncManager(); manager.setUser('alice');
  manager.enqueue('WORKSPACE_MUTATION', mutation('a1', 'Alice') as any);
  const running = manager.triggerSync();
  await requestStarted;
  manager.setUser('bob'); manager.enqueue('WORKSPACE_MUTATION', mutation('b1', 'Bob') as any);
  resolveRequest(ok(1)); await running;
  assert.equal(manager.getWorkspaceMutations()[0].id, 'b1');
  manager.setUser('alice');
  assert.equal(manager.getWorkspaceMutations()[0].id, 'a1');
  manager.setUser(null); assert.equal(manager.getPendingCount(), 0);
});

test('browser pulls overlay pending edits, preserve legacy keys, and reset data on logout', async (t) => {
  const storage = new MemoryStorage();
  const user = { ...DEFAULT_SUPER_ADMIN, id: 'alice' };
  storage.setItem('bb_auth_user_session_v3', JSON.stringify({ user, expiresAt: Date.now() + 60000 }));
  storage.setItem('bb_command_center_db_state_v13', JSON.stringify({ currentUser: { id: 'someone-else' }, orders: [{ id: 'private' }] }));
  const events = new EventTarget();
  class TestCustomEvent extends Event { detail: any; constructor(type: string, options?: any) { super(type); this.detail = options?.detail; } }
  mockGlobals(t, { localStorage: storage, window: events, navigator: { onLine: true }, CustomEvent: TestCustomEvent,
    fetch: async (_url: string, options: RequestInit) => options?.method === 'POST' ? Response.json({ success: false, error: 'Offline' }, { status: 503 }) : Response.json({ success: true, data: { products: [{ id: 'p1', name: 'Remote', sku: 'P1' }], users: [user], brands: [] }, versions: { products: { p1: 1 } }, errors: [] }) });
  const db = new DatabaseService();
  db.hydrateSnapshot({ products: [{ id: 'p1', name: 'Remote', sku: 'P1' }] }, user, { products: { p1: 1 } });
  db.updateProduct('p1', { name: 'Pending local' });
  await db.syncWithSupabase();
  assert.equal(db.getProductById('p1')?.name, 'Pending local');
  assert.equal(db.getPendingMutations().length, 1);
  assert.ok(storage.getItem('bb_command_center_db_state_v13'));
  db.setSessionUser(null);
  assert.equal(db.getProducts().length, 0);
  assert.equal(syncManager.getPendingCount(), 0);
  assert.match(storage.getItem('bb_workspace_queue_v1:alice')!, /Pending local/);
});

test('legacy queue recovers only matching source records and keeps uninterpretable work', (t) => {
  const storage = new MemoryStorage();
  const legacy = JSON.stringify([{ id: 'old1', type: 'ORDER_CREATED', payload: { id: 'o1' } }, { id: 'old2', type: 'UNKNOWN', payload: { text: 'Preserve me' } }]);
  storage.setItem('bb_command_center_offline_queue', legacy);
  mockGlobals(t, { localStorage: storage });
  const manager = new OfflineSyncManager(); manager.setUser('alice');
  manager.recoverLegacyQueue({ orders: [{ id: 'o1', customerName: 'Local' }] });
  assert.equal(manager.getWorkspaceMutations()[0].data?.customerName, 'Local');
  assert.deepEqual(manager.getQueue()[1].payload, { legacyId: 'old2' });
  assert.match(manager.getErrors()[0], /could not be matched/);
  assert.equal(storage.getItem('bb_command_center_offline_queue'), legacy);
});

test('refresh applies changed grants and brands, hiding denied pending records while retaining the outbox', async (t) => {
  const storage = new MemoryStorage();
  const previous = { ...DEFAULT_SUPER_ADMIN, id: 'alice' };
  const fresh = { ...previous, isSuperAdmin: false, role: 'SALES_OFFICER', assignedBrands: ['B'], customPermissions: { products: { access: 'HIDDEN', scope: null, actions: [] }, beat_plans: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE', 'EDIT'] } } };
  const expiresAt = Date.now() + 60000;
  storage.setItem('bb_auth_user_session_v3', JSON.stringify({ user: previous, expiresAt }));
  class TestCustomEvent extends Event { detail: any; constructor(type: string, options?: any) { super(type); this.detail = options?.detail; } }
  mockGlobals(t, { localStorage: storage, window: new EventTarget(), CustomEvent: TestCustomEvent, fetch: async () => Response.json({ success: true, data: { users: [fresh], brands: [], products: [] }, versions: {}, errors: [] }) });
  const db = new DatabaseService({ server: true });
  (db as any).server = false; (db as any).activeUserId = 'alice';
  syncManager.setUser('alice');
  syncManager.enqueue('WORKSPACE_MUTATION', { ...mutation('p-denied', 'Pending'), data: { id: 'p-denied', brandCode: 'A', name: 'Pending', sku: 'P' } } as any);
  await (db as any).pullWorkspace('alice');
  assert.equal(db.getCurrentUser().customPermissions?.products?.access, 'HIDDEN');
  assert.equal(db.getProducts().length, 0);
  assert.equal(syncManager.getPendingCount(), 1);
  assert.equal(JSON.parse(storage.getItem('bb_auth_user_session_v3')!).expiresAt, expiresAt);
});

test('officer scorecards never combine different users with identical display names', () => {
  const db = new DatabaseService({ server: true });
  db.replaceUsers(['alice', 'bob'].map(id => ({ ...DEFAULT_SUPER_ADMIN, id, fullName: 'Same Name', role: 'SALES_OFFICER', isSuperAdmin: false })));
  db.hydrateSnapshot({ visits: [{ id: 'visit', officerId: 'alice', officerName: 'Same Name' }] }, DEFAULT_SUPER_ADMIN);
  const scorecards = db.getScorecards();
  assert.equal(scorecards.find(card => card.officerId === 'alice')?.storesVisited, 1);
  assert.equal(scorecards.find(card => card.officerId === 'bob')?.storesVisited, 0);
});


test('authorized GPS refresh replaces cached officers, including an empty result', async (t) => {
  const officer = { ...DEFAULT_SUPER_ADMIN, id: 'officer1', role: 'SALES_OFFICER' };
  const previousUsers = coreDb.getUsers();
  (coreDb as any).users = [officer];
  coreDb.hydrateSnapshot({}, DEFAULT_SUPER_ADMIN);
  let rows: unknown[] = [{ officer_id: 'officer1', officer_name: 'Officer', lat: 27, lng: 85, status: 'AT_STORE', created_at: '2026-10-26T00:00:00Z' }];
  mockGlobals(t, { localStorage: new MemoryStorage(), fetch: async () => Response.json({ success: true, data: rows }) });
  t.after(() => { (coreDb as any).users = previousUsers; coreDb.hydrateSnapshot({}, DEFAULT_SUPER_ADMIN); });
  assert.equal((await fetchLatestPingsFromSupabase()).locations.length, 1);
  rows = [];
  assert.deepEqual((await fetchLatestPingsFromSupabase()).locations, []);
  assert.deepEqual(coreDb.exportSnapshot().staffLiveLocations, []);
  assert.ok(!coreDb.getPendingMutations().some((item) => item.collection === 'staffLiveLocations'));
});

test('shared access tokens contain 32 cryptographic random bytes in URL-safe form', () => {
  const db = new DatabaseService({ server: true });
  const link = db.createSharedAccessLink({ name: 'Review', allowedPages: ['dashboard'] } as any);
  assert.match(link.token, /^bb_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(link.token, db.createSharedAccessLink({ name: 'Other', allowedPages: [] } as any).token);
});

test('field users queue only changes to existing self notifications', (t) => {
  const storage = new MemoryStorage();
  const user = { ...DEFAULT_SUPER_ADMIN, id: 'officer1', isSuperAdmin: false, role: 'SALES_OFFICER' };
  storage.setItem('bb_auth_user_session_v3', JSON.stringify({ user, expiresAt: Date.now() + 60000 }));
  class TestCustomEvent extends Event { detail: any; constructor(type: string, options?: any) { super(type); this.detail = options?.detail; } }
  mockGlobals(t, { localStorage: storage, window: new EventTarget(), navigator: { onLine: true }, CustomEvent: TestCustomEvent });
  const db = new DatabaseService();
  db.hydrateSnapshot({ notifications: [{ id: 'n1', userId: user.id, title: 'Existing', read: false }] }, user);
  db.addNotification({ userId: 'admin', title: 'Foreign', message: '', read: false, priority: 'HIGH' } as any);
  db.addNotification({ userId: user.id, title: 'New self', message: '', read: false, priority: 'HIGH' } as any);
  assert.deepEqual(db.getPendingMutations(), []);
  db.markNotificationRead('n1');
  assert.equal(db.getPendingMutations().length, 1);
  assert.equal(db.getPendingMutations()[0].id, 'n1');
  db.setSessionUser(null);
});

test('matching legacy data is backed up but permission-denied defaults are not uploaded', async (t) => {
  const storage = new MemoryStorage();
  const user = { ...DEFAULT_SUPER_ADMIN, id: 'officer1', isSuperAdmin: false, role: 'SALES_OFFICER', customPermissions: {}, permissions: {}, assignedBrands: ['BRAND'] };
  const legacy = JSON.stringify({ currentUser: user, products: [{ id: 'p1', name: 'Private legacy', sku: 'P1', brandCode: 'BRAND' }] });
  storage.setItem('bb_auth_user_session_v3', JSON.stringify({ user, expiresAt: Date.now() + 60000 }));
  storage.setItem('bb_command_center_db_state_v14', legacy);
  class TestCustomEvent extends Event { detail: any; constructor(type: string, options?: any) { super(type); this.detail = options?.detail; } }
  mockGlobals(t, { localStorage: storage, window: new EventTarget(), navigator: { onLine: true }, CustomEvent: TestCustomEvent,
    fetch: async () => Response.json({ success: true, data: { users: [user], brands: [] }, versions: {}, errors: [] }) });
  const db = new DatabaseService();
  await db.syncWithSupabase();
  assert.deepEqual(db.getPendingMutations(), []);
  assert.equal(storage.getItem('bb_command_center_db_state_v14'), legacy);
  db.setSessionUser(null);
});
