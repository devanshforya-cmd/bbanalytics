import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeDatabase } from './fake-supabase.ts';
import { setTestDatabaseClient } from '../src/lib/db/supabase-server.ts';
import { saveWorkspaceMutation } from '../src/lib/db/server-workspace.ts';
import { canCorrect, canMoveTo, dispatchFromOrder, dispatchStatus, nextSteps, orderStatusFor, paymentDueDate } from '../src/lib/dispatch-flow.ts';
import { DATASETS } from '../src/lib/export/datasets.ts';
import { dispatchWorkbookSheets } from '../src/lib/export/record-downloads.ts';
import { buildWorkbook } from '../src/lib/export/xlsx.ts';
import { unzipSync, strFromU8 } from 'fflate';

const admin: any = { id: 'admin', fullName: 'Devansh', email: '', phone: '', role: 'SUPER_ADMIN', isSuperAdmin: true, active: true, assignedBrands: ['ALL'], permissions: {}, customPermissions: {} };
const rider: any = { id: 'rider', fullName: 'Rajan', email: '', phone: '', role: 'CUSTOM', active: true, assignedBrands: ['ALL'], permissions: {},
  customPermissions: { beat_plans: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE', 'EDIT'] }, stores: { access: 'VIEW_ONLY', scope: 'OWN', actions: ['VIEW'] } } };
const userRow = (user: any) => ({ id: user.id, full_name: user.fullName, role: user.role, is_super_admin: !!user.isSuperAdmin, is_active: true, assigned_brands: user.assignedBrands, custom_permissions: user.customPermissions, permissions: {} });
const mutation = (collection: string, data: any, expectedVersion = 0) => ({ collection, id: data.id, operation: 'upsert' as const, data, expectedVersion, mutationId: `m_${Math.random().toString(36).slice(2)}_${Date.now()}` });

function database() {
  const db = new FakeDatabase();
  db.tables.users = [userRow(admin), userRow(rider)];
  db.tables.brands = [{ id: 'b1', code: 'FORYA', name: 'Forya', is_active: true }];
  db.seed('products', { id: 'p1', name: 'Roll-On Peach', sku: 'ROP', brandCode: 'FORYA', mrp: 500, caseSize: 24, active: true });
  db.seed('distributors', { id: 'fewa', name: 'Fewa Trade', type: 'Distributor', storeType: 'DISTRIBUTOR', brandsCarried: ['FORYA'], contacts: [] });
  db.seed('retailers', { id: 'r1', name: 'Shrestha Kirana', brandsStocked: ['FORYA'], assignedOfficerId: 'rider', distributorId: 'fewa', distributorName: 'Fewa Trade', contacts: [] });
  setTestDatabaseClient(db as any);
  return db;
}
const storeOrder = (extra: Record<string, unknown> = {}) => ({ id: 'so1', orderNumber: 'PENDING-SO1', officerId: 'rider', officerName: 'Rajan', entityType: 'RETAILER', entityId: 'r1', storeName: 'Shrestha Kirana',
  contactName: '', contactPhone: '', orderDateAd: '2026-11-20', orderDateBs: '', totalAmount: 9600, totalUnits: 24, status: 'PENDING_DISPATCH', paymentTerms: '15 days credit', createdAt: '2026-11-20T05:00:00Z',
  items: [{ productId: 'p1', productName: 'Roll-On Peach', brandCode: 'FORYA', cases: 1, unitsPerCase: 24, totalUnits: 24, unitPrice: 400, totalAmount: 9600 }], ...extra });

test('steps go forward from received to delivered, and can be cancelled until delivery', () => {
  assert.deepEqual(nextSteps('ORDER_RECEIVED'), ['PACKED', 'DISPATCHED', 'CANCELLED']);
  assert.equal(canMoveTo('DELIVERED', 'CANCELLED'), false);
  assert.equal(canMoveTo('DISPATCHED', 'PACKED'), false);
  assert.equal(canCorrect('DISPATCHED'), true);
  assert.equal(canCorrect('DELIVERED'), false);
  assert.equal(dispatchStatus({}), 'DISPATCHED'); // older dispatches
  assert.equal(orderStatusFor('PACKED'), 'PENDING_DISPATCH');
  assert.equal(orderStatusFor('DELIVERED'), 'DELIVERED');
  assert.equal(paymentDueDate('2026-11-20', '15 days credit'), '2026-12-05');
  assert.equal(paymentDueDate('2026-11-20', 'Cash on delivery'), '');
});

test('a store order taken on a visit becomes a dispatch order at once, marked Order received', async () => {
  const db = database();
  await saveWorkspaceMutation(rider, mutation('secondaryOrders', storeOrder()));
  const order = db.records('secondaryOrders')[0].data;
  const [dispatch] = db.records('dispatches');
  assert.ok(dispatch, 'dispatch order created');
  assert.equal(dispatch.id, 'disp_so_so1');
  assert.equal(dispatch.data.status, 'ORDER_RECEIVED');
  assert.equal(dispatch.data.dispatchNumber, 'DP-0001');
  assert.equal(dispatch.data.orderNumber, order.orderNumber);
  assert.equal(dispatch.data.fulfilledBy, 'DISTRIBUTOR');
  assert.equal(dispatch.data.fulfillerName, 'Fewa Trade');
  assert.equal(dispatch.data.items[0].quantity, 24);
  assert.equal(dispatch.data.items[0].unitPrice, 400);
});

test('moving the dispatch order along moves the store order; delivered is final', async () => {
  const db = database();
  await saveWorkspaceMutation(rider, mutation('secondaryOrders', storeOrder()));
  let row = db.records('dispatches')[0];
  await saveWorkspaceMutation(admin, mutation('dispatches', { ...row.data, status: 'DISPATCHED', dispatchDateAd: '2026-11-21' }, row.version));
  assert.equal(db.records('secondaryOrders')[0].data.status, 'DISPATCHED');
  row = db.records('dispatches')[0];
  await saveWorkspaceMutation(admin, mutation('dispatches', { ...row.data, status: 'DELIVERED' }, row.version));
  assert.equal(db.records('secondaryOrders')[0].data.status, 'DELIVERED');
  row = db.records('dispatches')[0];
  await assert.rejects(saveWorkspaceMutation(admin, mutation('dispatches', { ...row.data, status: 'CANCELLED' }, row.version)), /already delivered/);
});

test('cancelling a store order before it is sent cancels its dispatch order', async () => {
  const db = database();
  await saveWorkspaceMutation(rider, mutation('secondaryOrders', storeOrder()));
  const order = db.records('secondaryOrders')[0];
  await saveWorkspaceMutation(rider, mutation('secondaryOrders', { ...order.data, status: 'CANCELLED' }, order.version));
  assert.equal(db.records('dispatches')[0].data.status, 'CANCELLED');
});

test('dispatch sheets: one row per order with status, ordered vs sent and value', () => {
  const order: any = storeOrder({ orderNumber: 'SO-0001' });
  const dispatch: any = { ...dispatchFromOrder(order, { id: 'r1', name: 'Shrestha Kirana', type: 'RETAILER', distributorId: 'fewa', distributorName: 'Fewa Trade' }, 'Devansh'), dispatchNumber: 'DP-0001' };
  dispatch.items[0].quantity = 20;
  const source: any = { dispatches: [dispatch], products: [{ id: 'p1', name: 'Roll-On Peach', brandCode: 'FORYA', caseSize: 24 }], brands: [{ code: 'FORYA', name: 'Forya' }], combos: [] };
  const sheet = DATASETS.find((d) => d.key === 'dispatch_orders')!.build(source, {});
  const row = Object.fromEntries(sheet.columns.map((c, i) => [c.header, sheet.rows[0][i]]));
  assert.equal(row['Status'], 'Order received');
  assert.equal(row['Units ordered'], 24);
  assert.equal(row['Units sent'], 20);
  assert.equal(row['Value (NPR)'], 8000);
  assert.equal(row['Delivered by'], 'Fewa Trade');
});

test('one order downloads as its own sheet with details above the lines', () => {
  const order: any = storeOrder({ orderNumber: 'SO-0001' });
  const dispatch: any = { ...dispatchFromOrder(order, null, 'Devansh'), dispatchNumber: 'DP-0001' };
  const sheets = dispatchWorkbookSheets(dispatch, [{ id: 'p1', name: 'Roll-On Peach', alias: 'Peach RO', brandCode: 'FORYA', caseSize: 24 } as any], [{ code: 'FORYA', name: 'Forya' } as any], true);
  assert.equal(sheets[0].intro?.[0][0], 'Order challan');
  const xml = strFromU8(unzipSync(buildWorkbook(sheets))['xl/worksheets/sheet1.xml']);
  const top = (sheets[0].intro?.length || 0) + 2;
  assert.match(xml, new RegExp(`<pane ySplit="${top}"`));
  assert.match(xml, /Peach RO/);
  assert.match(xml, new RegExp(`<autoFilter ref="A${top}:`));
});
