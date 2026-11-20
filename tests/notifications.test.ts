import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeDatabase } from './fake-supabase.ts';
import { useTestDatabaseClient } from '../src/lib/db/supabase-server.ts';
import { saveWorkspaceMutation } from '../src/lib/db/server-workspace.ts';
import { dayPart, GREETING, nepalHour } from '../src/lib/greeting.ts';
import { eventRecipients, cleanRouting } from '../src/lib/notification-events.ts';
import { readRouting, saveRouting } from '../src/lib/notify-server.ts';
import { notificationTarget, isMessage } from '../src/lib/notification-open.ts';

const admin: any = { id: 'admin', fullName: 'Devansh', role: 'SUPER_ADMIN', isSuperAdmin: true, active: true, assignedBrands: ['ALL'], permissions: {}, customPermissions: {} };
const packer: any = { id: 'packer', fullName: 'Sita', role: 'CUSTOM', active: true, assignedBrands: ['ALL'], permissions: {}, customPermissions: { dispatches: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'EDIT'] } } };
const rider: any = { id: 'rider', fullName: 'Rajan', role: 'CUSTOM', active: true, assignedBrands: ['ALL'], permissions: {},
  customPermissions: { beat_plans: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE', 'EDIT'] }, stores: { access: 'VIEW_ONLY', scope: 'OWN', actions: ['VIEW'] } } };
const outsider: any = { id: 'outsider', fullName: 'Hari', role: 'CUSTOM', active: true, assignedBrands: ['ALL'], permissions: {}, customPermissions: {} };
const users = [admin, packer, rider, outsider];
const opts = { isSuperAdmin: (u: any) => !!u.isSuperAdmin, canOpen: (u: any, f: string) => !!u.customPermissions?.[f] };
const ids = (list: any[]) => list.map((u) => u.id).sort();

test('the brief greeting follows the time of day in Nepal', () => {
  const at = (utc: string) => dayPart(new Date(utc));
  assert.equal(nepalHour(new Date('2026-11-20T00:15:00Z')), 6); // 6:00 Nepal
  assert.equal(at('2026-11-20T01:00:00Z'), 'MORNING');   // 6:45
  assert.equal(at('2026-11-20T07:00:00Z'), 'AFTERNOON'); // 12:45
  assert.equal(at('2026-11-20T12:00:00Z'), 'EVENING');   // 17:45
  assert.equal(at('2026-11-20T17:00:00Z'), 'NIGHT');     // 22:45
  assert.equal(GREETING.EVENING.hello, 'Good evening');
});

test('page notifications go to people who can open the page and Super Admins, never the person who did it', () => {
  assert.deepEqual(ids(eventRecipients('store_order_new', users, {}, { ...opts, actorId: 'rider' })), ['admin', 'packer']);
  assert.deepEqual(ids(eventRecipients('store_order_new', users, {}, { ...opts, actorId: 'admin' })), ['packer']);
});

test('Super Admin choices: off, stop for someone, add someone — but only if they can open it', () => {
  assert.deepEqual(eventRecipients('store_order_new', users, { store_order_new: { enabled: false } }, opts), []);
  assert.deepEqual(ids(eventRecipients('store_order_new', users, { store_order_new: { muteUserIds: ['admin'] } }, opts)), ['packer']);
  assert.deepEqual(ids(eventRecipients('store_order_new', users, { store_order_new: { addUserIds: ['outsider'] } }, opts)), ['admin', 'packer']);
  assert.deepEqual(ids(eventRecipients('document_new', users, { document_new: { addUserIds: ['outsider'] } }, opts)), ['admin']);
  assert.deepEqual(ids(eventRecipients('online_order_new', users, {}, opts)), [], 'online orders are off until switched on');
  assert.deepEqual(ids(eventRecipients('task_assigned', [...users, { ...outsider, id: 'tasker', customPermissions: { tasks: { access: 'FULL' } } }], {}, { ...opts, personIds: ['tasker'] })), ['tasker']);
  assert.deepEqual(cleanRouting({ store_order_new: { enabled: false, addUserIds: ['a', 'a', 5, 'b c'] }, nonsense: {} }), { store_order_new: { enabled: false, addUserIds: ['a'], muteUserIds: [] } });
});

test('clicking: a message opens itself, an event opens its record', () => {
  assert.equal(isMessage({ kind: 'MESSAGE' }), true);
  assert.equal(notificationTarget({ id: 'n', userId: 'a', title: 'New store order', message: '', read: false, createdAt: '', priority: 'MEDIUM', link: '/offline-sales/dispatch?q=SO-1' } as any), '/offline-sales/dispatch?q=SO-1');
  assert.equal(notificationTarget({ id: 'n', userId: 'a', title: 'x', message: '', read: false, createdAt: '', priority: 'MEDIUM', link: '//evil.test', entityType: 'orders', entityId: 'o1' } as any), '/orderflow/orders/o1');
  assert.equal(notificationTarget({ id: 'n', userId: 'a', title: 'Cheque bounced', message: '', read: false, createdAt: '', priority: 'MEDIUM' } as any), '/offline-sales/cheques');
});

const userRow = (user: any) => ({ id: user.id, full_name: user.fullName, role: user.role, is_super_admin: !!user.isSuperAdmin, is_active: true, assigned_brands: user.assignedBrands, custom_permissions: user.customPermissions, permissions: {} });
const mutation = (collection: string, data: any) => ({ collection, id: data.id, operation: 'upsert' as const, data, expectedVersion: 0, mutationId: `m_${Math.random().toString(36).slice(2)}` });
function database() {
  const db = new FakeDatabase();
  db.tables.users = users.map(userRow);
  db.tables.brands = [{ id: 'b1', code: 'FORYA', name: 'Forya', is_active: true }];
  db.seed('products', { id: 'p1', name: 'Roll-On Peach', sku: 'ROP', brandCode: 'FORYA', mrp: 500, caseSize: 24, active: true });
  db.seed('retailers', { id: 'r1', name: 'Shrestha Kirana', brandsStocked: ['FORYA'], assignedOfficerId: 'rider', contacts: [] });
  useTestDatabaseClient(db as any);
  return db;
}
const storeOrder = { id: 'so1', orderNumber: '', officerId: 'rider', officerName: 'Rajan', entityType: 'RETAILER', entityId: 'r1', storeName: 'Shrestha Kirana', contactName: '', contactPhone: '',
  orderDateAd: '2026-11-20', orderDateBs: '', totalAmount: 9600, totalUnits: 24, status: 'PENDING_DISPATCH', createdAt: '2026-11-20T05:00:00Z',
  items: [{ productId: 'p1', productName: 'Roll-On Peach', brandCode: 'FORYA', cases: 1, unitsPerCase: 24, totalUnits: 24, unitPrice: 400, totalAmount: 9600 }] };

test('a new store order pops up for the dispatch team with a link to it, and respects a stop', async () => {
  const db = database();
  await saveRouting({});
  await saveWorkspaceMutation(rider, mutation('secondaryOrders', storeOrder));
  const notes = db.records('notifications').map((r: any) => r.data).filter((n: any) => n.event === 'store_order_new');
  assert.deepEqual(notes.map((n: any) => n.userId).sort(), ['admin', 'packer']);
  assert.match(notes[0].link, /^\/offline-sales\/dispatch\?q=/);
  assert.equal(notes[0].kind, 'EVENT');
  assert.doesNotMatch(notes[0].message, /9600|9,600/, 'no money in notifications');

  const db2 = database();
  await saveRouting({ store_order_new: { muteUserIds: ['admin'] } });
  assert.deepEqual((await readRouting()).store_order_new?.muteUserIds, ['admin']);
  await saveWorkspaceMutation(rider, mutation('secondaryOrders', { ...storeOrder, id: 'so2' }));
  assert.deepEqual(db2.records('notifications').map((r: any) => r.data).filter((n: any) => n.event === 'store_order_new').map((n: any) => n.userId), ['packer']);
  await saveRouting({});
});
