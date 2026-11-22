import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeDatabase } from './fake-supabase.ts';
import { setTestDatabaseClient } from '../src/lib/db/supabase-server.ts';
import { allocateSequence } from '../src/lib/db/document-counter.ts';
import { prepareRecordData, saveWorkspaceMutation, validateWorkspaceMutation } from '../src/lib/db/server-workspace.ts';
import { planDataUpgrade, runDataUpgrade } from '../src/lib/db/data-upgrade.ts';
import { canReadWorkspaceRecord, canWriteWorkspaceRecord, type StoredWorkspaceRecord } from '../src/lib/db/workspace-policy.ts';
import { DatabaseService } from '../src/lib/db/db-service.ts';
import { brandPrefix, dayNumbers, defaultBrandPrefix, displayDocumentId, formatDocumentId, isShortDocumentId, matchesDocumentId, validateBrandPrefix } from '../src/lib/document-ids.ts';
import { exactCustomer, isFullPhone, namesDiffer, nearMissCustomers, phoneDigits, searchCustomers } from '../src/lib/customer-lookup.ts';
import { diffOrder, editNeedsReason } from '../src/lib/order-history.ts';
import { contentLinks, isDriveLink, sendIsOverdue, sendStatusLabel } from '../src/lib/marketing.ts';
import { buildMonthlySalesReport } from '../src/lib/monthly-sales-report.ts';
import { buildGoogleReportTabs } from '../src/lib/google-workspace-reports.ts';
import { projectSharedPortal } from '../src/app/api/shared/[token]/projection.ts';
import { visibleOrders } from '../src/app/api/_workspace.ts';
import { failureReasonLabel, isOtherReason } from '../src/lib/failure-reason.ts';
import { exchangeAnalysis, exchangeNeedsLink } from '../src/lib/exchange.ts';
import { getRedirectPathForUser } from '../src/lib/auth.ts';
import { cohortRetention, lifecycleMovements } from '../src/lib/customer-cohorts.ts';
import { countsAsSale } from '../src/lib/order-status.ts';
import { calendarScopeForPath, scopedDate } from '../src/lib/calendar-scope.ts';

const admin: any = { id: 'admin', fullName: 'Devansh', email: '', phone: '', role: 'SUPER_ADMIN', isSuperAdmin: true, active: true, assignedBrands: ['ALL'], permissions: {}, customPermissions: {} };
// A role with no built-in template, so only the saved permissions below apply.
const marketer: any = { id: 'mk', fullName: 'Marketing Staff', email: '', phone: '', role: 'CUSTOM', active: true, assignedBrands: ['ALL'], permissions: {},
  customPermissions: { marketing: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] } } };
const userRow = (user: any) => ({ id: user.id, full_name: user.fullName, role: user.role, is_super_admin: !!user.isSuperAdmin, is_active: true, assigned_brands: user.assignedBrands, custom_permissions: user.customPermissions, permissions: {} });
const product = { id: 'p1', name: 'Roll-On Peach', sku: 'ROP', brandCode: 'FORYA', mrp: 500, active: true };
const product2 = { id: 'p2', name: 'Body Wash', sku: 'BW', brandCode: 'FORYA', mrp: 800, active: true };
const item = (p = product, quantity = 1) => ({ productId: p.id, productName: p.name, brandCode: p.brandCode, quantity, unitPrice: p.mrp, totalPrice: p.mrp * quantity });
const orderData = (id: string, extra: Record<string, unknown> = {}) => ({ id, orderNumber: `PENDING-${id.toUpperCase()}`, brandCode: 'FORYA', orderDateAd: '2026-11-17', orderDateBs: 'Mangsir 1, 2083', platform: 'WhatsApp',
  customerName: 'Sita Gurung', customerPhone: '9841234567', province: 'Bagmati Province', district: 'Kathmandu', address: 'Thamel', deliveryMethod: 'Pathao', paymentTerms: 'COD', orderType: 'NEW',
  items: [item()], totalAmount: 500, status: 'PENDING', source: 'MANUAL', assignedToId: 'admin', createdAt: '2026-11-17T05:00:00.000Z', ...extra });
const mutation = (collection: string, data: any, expectedVersion = 0, operation: 'upsert' | 'delete' = 'upsert') => ({ collection, id: data.id, operation, ...(operation === 'upsert' ? { data } : {}), expectedVersion, mutationId: `mutation_${Math.random().toString(36).slice(2)}_${Date.now()}` });

function database() {
  const db = new FakeDatabase();
  db.tables.users = [userRow(admin), userRow(marketer)];
  db.tables.brands = [{ id: 'b1', code: 'FORYA', name: 'Forya', is_active: true }, { id: 'b2', code: 'PEESAFE', name: 'Pee Safe', is_active: true }];
  db.seed('products', product); db.seed('products', product2);
  setTestDatabaseClient(db as any);
  return db;
}

// ---------------------------------------------------------------------------------------------
// Change 8: short IDs
// ---------------------------------------------------------------------------------------------

test('short IDs: PREFIX-NNNN, growth past 9999, brand prefixes and reserved document prefixes', () => {
  assert.equal(formatDocumentId('FOR', 421), 'FOR-0421');
  assert.equal(formatDocumentId('FOR', 9999), 'FOR-9999');
  assert.equal(formatDocumentId('FOR', 10000), 'FOR-10000');
  assert.equal(formatDocumentId('MS', 12), 'MS-0012');
  assert.equal(isShortDocumentId('FOR-0421'), true);
  assert.equal(isShortDocumentId('BB-MAN-4821'), false);
  assert.equal(defaultBrandPrefix('FORYA'), 'FOR');
  assert.equal(defaultBrandPrefix('PEE_SAFE'), 'PEE');
  assert.notEqual(defaultBrandPrefix('MS'), 'MS'); // MS belongs to marketing sends
  assert.equal(brandPrefix('forya', { FORYA: 'FY' }), 'FY');
  assert.equal(brandPrefix('FORYA', { FORYA: 'MS' }), 'FOR'); // a reserved saved value falls back to the default
  assert.throws(() => validateBrandPrefix('SO'), /reserved/);
  assert.throws(() => validateBrandPrefix('F'), /two or three/);
  assert.throws(() => validateBrandPrefix('FORY'), /two or three/);
  assert.equal(displayDocumentId('PENDING-ABC123'), 'Awaiting ID');
});

test('search finds a short ID by 0421, for0421, FOR-0421, 421 and by its earlier long ID', () => {
  for (const query of ['0421', 'for0421', 'FOR-0421', 'For 0421', '421']) assert.equal(matchesDocumentId(query, 'FOR-0421', 'BB-MAN-7781'), true, query);
  assert.equal(matchesDocumentId('bb-man-7781', 'FOR-0421', 'BB-MAN-7781'), true);
  assert.equal(matchesDocumentId('bbman7781', 'FOR-0421', 'BB-MAN-7781'), true);
  assert.equal(matchesDocumentId('0422', 'FOR-0421', 'BB-MAN-7781'), false);
  assert.equal(matchesDocumentId('4', 'FOR-0421'), false);
});

test('day numbers follow creation order and never depend on the short ID', () => {
  const numbers = dayNumbers([{ id: 'c', createdAt: '2026-11-17T09:00:00Z' }, { id: 'a', createdAt: '2026-11-17T07:00:00Z' }, { id: 'b', createdAt: '2026-11-17T08:00:00Z' }]);
  assert.deepEqual([numbers.get('a'), numbers.get('b'), numbers.get('c')], [1, 2, 3]);
});

test('one hundred simultaneous saves receive one hundred different consecutive numbers', async () => {
  const db = database();
  const numbers = await Promise.all(Array.from({ length: 100 }, () => allocateSequence('FOR', 1, 'admin')));
  assert.equal(new Set(numbers).size, 100);
  assert.deepEqual([...numbers].sort((a, b) => a - b), Array.from({ length: 100 }, (_, index) => index + 1));
  assert.equal(db.records('documentCounters')[0].data.last, 100);
  // Other documents count separately.
  assert.equal(await allocateSequence('MS', 1, 'admin'), 1);
});

test('two orders saved at the same instant get different short IDs; the ID never changes on edit', async () => {
  const db = database();
  const results = await Promise.all([saveWorkspaceMutation(admin, mutation('orders', orderData('ord_one'))), saveWorkspaceMutation(admin, mutation('orders', orderData('ord_two', { customerPhone: '9800000002' })))]);
  const ids = db.records('orders').map((row) => row.data.orderNumber).sort();
  assert.deepEqual(ids, ['FOR-0001', 'FOR-0002']);
  assert.deepEqual(results.map((result) => result.assigned?.orderNumber).sort(), ids);
  // A browser that sends back a different number cannot change it.
  const stored = db.records('orders').find((row) => row.id === 'ord_one')!;
  await saveWorkspaceMutation(admin, mutation('orders', { ...stored.data, orderNumber: 'FOR-9999', address: 'New Road', _edit: { token: 't1', fields: ['address'] } }, stored.version));
  const after = db.records('orders').find((row) => row.id === 'ord_one')!;
  assert.equal(after.data.orderNumber, stored.data.orderNumber);
  assert.equal(after.data.address, 'New Road');
});

test('an ID that arrives with an order is kept as the searchable legacy ID; a clashing old ID is skipped', async () => {
  const db = database();
  db.seed('orders', orderData('ord_old', { orderNumber: 'FOR-0001', customerPhone: '9800000009' }));
  await saveWorkspaceMutation(admin, mutation('orders', orderData('ord_import', { orderNumber: 'bb-wa-1234abcd' })));
  const saved = db.records('orders').find((row) => row.id === 'ord_import')!.data;
  assert.equal(saved.orderNumber, 'FOR-0002');
  assert.equal(saved.legacyOrderNumber, 'BB-WA-1234ABCD');
  assert.equal(matchesDocumentId('1234abcd', saved.orderNumber, saved.legacyOrderNumber), true);
});

test('marketing sends, field orders and dispatches each use their own prefix and counter', async () => {
  const db = database();
  db.seed('influencers', { id: 'inf1', name: 'Aashika', isActive: true });
  db.seed('retailers', { id: 'store1', name: 'Store', brandsStocked: ['FORYA'], assignedOfficerId: 'admin' });
  await saveWorkspaceMutation(admin, mutation('marketingSends', { id: 'send1', sendNumber: 'PENDING-X', influencerId: 'inf1', brandCodes: ['FORYA'], reachOutPlatform: 'Instagram DM', responsibleId: 'admin',
    sentDateAd: '2026-11-17', sentDateBs: '', items: [{ productId: 'p1', productName: 'x', brandCode: 'FORYA', quantity: 2 }], deliveryChannel: 'Pathao', status: 'SENT', createdAt: '2026-11-17T05:00:00Z' }));
  await saveWorkspaceMutation(admin, mutation('dispatches', { id: 'disp1', distributorId: 'd', distributorName: 'D', dispatchDateAd: '2026-11-17', dispatchDateBs: '', items: [], createdBy: 'Devansh', createdAt: '' }));
  assert.equal(db.records('marketingSends')[0].data.sendNumber, 'MS-0001');
  assert.equal(db.records('marketingSends')[0].data.influencerName, 'Aashika');
  assert.equal(db.records('dispatches')[0].data.dispatchNumber, 'DP-0001');
  assert.equal(db.records('orders').length, 0);
});

// ---------------------------------------------------------------------------------------------
// Change 6: marketing sends never reach sales numbers (permanent regression test)
// ---------------------------------------------------------------------------------------------

function salesNumbers(db: DatabaseService) {
  const orders = db.getOrders('ALL');
  const month = buildMonthlySalesReport(orders, db.getProducts('ALL'), db.getCombos('ALL'), 'FORYA', '2026-11-01', '2026-11-30');
  const sheets = buildGoogleReportTabs(db, '2026-11', new Date('2026-11-17T06:00:00Z'));
  const link: any = { id: 'l', token: 't', name: 'Agency', isActive: true, brandScope: 'ALL', brandFilter: [], allowedPages: ['dashboard'], dateRangeType: 'LIVE', showCustomerDetails: false, showStaffDetails: false, showOrderRows: false, showProductNames: false, showComboDetails: false, accessCount: 0, createdAt: '' };
  return {
    dailyOrders: orders.filter((order) => order.orderDateAd === '2026-11-17').length,
    dailyUnits: orders.filter((order) => order.orderDateAd === '2026-11-17').reduce((sum, order) => sum + order.items.reduce((units, line) => units + line.quantity, 0), 0),
    dashboardOrders: orders.length,
    scopedOrders: db.getFilteredOrders(admin).length,
    apiOrders: visibleOrders(db, admin).length,
    monthOrders: month.orderCount, monthSales: month.salesCents,
    sheetOrderRows: sheets.find((tab) => tab.title === 'Orders-2026-11')!.values.length - 1,
    sheetSummaryOrders: sheets.find((tab) => tab.title === 'Summary')!.values.find((row) => row[0] === 'Total Orders')![1],
    sharedOrders: projectSharedPortal(db, link).summary!.totalOrders,
    customers: db.getCustomers().length, customerOrders: db.getCustomers().reduce((sum, customer) => sum + customer.totalOrders, 0),
    karma: db.getCustomers().reduce((sum, customer) => sum + customer.karmaScore, 0),
    deliveryFailures: db.getDeliveryFailures('ALL').length, returns: db.getReturns('ALL').length,
  };
}

test('creating a marketing send changes no order, sales, export, shared-link, customer or karma number', () => {
  const db = new DatabaseService({ server: true });
  db.replaceBrands([{ id: 'b1', code: 'FORYA', name: 'Forya', color: '#000', description: '' } as any]); db.replaceUsers([admin]);
  db.hydrateSnapshot({ products: [product, product2] as any, orders: [orderData('o1', { orderNumber: 'FOR-0001' }), orderData('o2', { orderNumber: 'FOR-0002', customerPhone: '9800000002' })] as any,
    customers: [{ id: 'c1', phone: '9841234567', name: 'Sita Gurung', city: 'Kathmandu', province: '', totalOrders: 1, totalDelivered: 0, totalReturns: 0, totalDeliveryFailures: 0, totalCancellations: 0, totalComplaints: 0, totalReviews: 0, karmaScore: 72, segment: 'NEW', activeFlags: [], brandsPurchased: ['FORYA'] }] as any,
    influencers: [{ id: 'inf1', name: 'Aashika', platforms: [], qualityRating: 'NOT_RATED', totalSends: 0, totalContent: 0, isActive: true, createdAt: '' }] as any }, admin);
  const before = salesNumbers(db);

  const send = db.createMarketingSend({ influencerId: 'inf1', brandCodes: ['FORYA'], reachOutPlatform: 'Instagram DM', responsibleId: 'admin', sentDateAd: '2026-11-17', sentDateBs: 'Mangsir 1, 2083',
    items: [{ productId: 'p1', productName: product.name, brandCode: 'FORYA', quantity: 3 }, { productId: 'p2', productName: product2.name, brandCode: 'FORYA', quantity: 1 }], deliveryChannel: 'Pathao' });

  assert.deepEqual(salesNumbers(db), before);
  assert.equal(db.getMarketingSends().length, 1);
  // Only marketing records are written: nothing in orders or customers.
  assert.deepEqual([...new Set(db.getPendingMutations().map((entry) => entry.collection))].sort(), ['influencers', 'marketingSends']);
  // The send has no money or order fields at all.
  assert.deepEqual(Object.keys(send).filter((key) => /price|amount|total|payment|orderType|orderNumber/i.test(key)), []);
  // It does appear on its own export tab, and only there.
  const tabs = buildGoogleReportTabs(db, '2026-11', new Date('2026-11-17T06:00:00Z'));
  assert.equal(tabs.find((tab) => tab.title === 'Marketing Sends')!.values.length, 2);
  assert.equal(JSON.stringify(tabs.filter((tab) => tab.title !== 'Marketing Sends')).includes('Aashika'), false);
});

test('an order can never be a marketing send, on the device or on the server', () => {
  const db = new DatabaseService({ server: true }); db.replaceBrands([{ id: 'b1', code: 'FORYA', name: 'Forya' } as any]); db.hydrateSnapshot({ products: [product] as any }, admin);
  assert.throws(() => db.addOrder({ ...(orderData('x') as any), isMarketing: true }), /influencer profile/);
  const context: any = { users: [admin], brands: [{ code: 'FORYA' }], records: [{ collection: 'products', id: 'p1', data: product, created_by: 'admin', version: 1 }] };
  assert.throws(() => prepareRecordData(admin, mutation('orders', orderData('x', { isMarketing: true })) as any, null, context), /influencer profile/);
  // A send that tries to carry money is refused before it is stored.
  const send = { id: 's', influencerId: 'inf1', brandCodes: ['FORYA'], reachOutPlatform: 'WhatsApp', deliveryChannel: 'Pathao', sentDateAd: '2026-11-17', status: 'SENT', items: [{ productId: 'p1', quantity: 1 }] };
  assert.doesNotThrow(() => validateWorkspaceMutation(mutation('marketingSends', send)));
  assert.throws(() => validateWorkspaceMutation(mutation('marketingSends', { ...send, totalAmount: 0 })), /price, payment or order/);
  assert.throws(() => validateWorkspaceMutation(mutation('marketingSends', { ...send, items: [{ productId: 'p1', quantity: 1, unitPrice: 0 }] })), /price, payment or order/);
  assert.throws(() => validateWorkspaceMutation(mutation('marketingSends', { ...send, influencerId: '' })), /influencer profile/);
  assert.throws(() => validateWorkspaceMutation(mutation('marketingSends', { ...send, expectedContentDateAd: '2026-11-01' })), /earlier than the sent date/);
});

test('an older order still carrying the marketing flag is invisible to every order reader until it is upgraded', () => {
  const db = new DatabaseService({ server: true }); db.replaceBrands([{ id: 'b1', code: 'FORYA', name: 'Forya' } as any]);
  db.hydrateSnapshot({ products: [product] as any, orders: [orderData('o1', { orderNumber: 'FOR-0001' }), orderData('legacy', { orderNumber: 'BB-MKT-1', isMarketing: true, totalAmount: 0 })] as any }, admin);
  assert.deepEqual(db.getOrders('ALL').map((order) => order.id), ['o1']);
  assert.equal(db.getOrderById('legacy'), undefined);
  assert.equal(db.getFilteredOrders(admin).length, 1);
  assert.equal(db.getLegacyMarketingOrderCount(), 1);
});

test('a send cannot exist without an influencer, and its names come from the server', async () => {
  const db = database();
  const send = { id: 'send1', sendNumber: 'PENDING-X', influencerId: 'missing', influencerName: 'Forged', brandCodes: ['FORYA'], reachOutPlatform: 'WhatsApp', responsibleId: 'admin', responsibleName: 'Forged',
    sentDateAd: '2026-11-17', sentDateBs: '', items: [{ productId: 'p1', productName: 'Forged', brandCode: 'FORYA', quantity: 1 }], deliveryChannel: 'Pathao', status: 'SENT', createdAt: '' };
  await assert.rejects(saveWorkspaceMutation(marketer, mutation('marketingSends', send)), /Create the influencer first/);
  db.seed('influencers', { id: 'inf1', name: 'Aashika', isActive: true });
  await saveWorkspaceMutation(marketer, mutation('marketingSends', { ...send, influencerId: 'inf1' }));
  const saved = db.records('marketingSends')[0].data;
  assert.equal(saved.influencerName, 'Aashika'); assert.equal(saved.responsibleName, 'Devansh'); assert.equal(saved.items[0].productName, 'Roll-On Peach');
  // Products must belong to a selected brand.
  await assert.rejects(saveWorkspaceMutation(marketer, mutation('marketingSends', { ...send, id: 'send2', influencerId: 'inf1', brandCodes: ['PEESAFE'] })), /selected brands/);
  // The responsible person is told once.
  assert.equal(db.records('notifications').filter((row) => row.data.userId === 'admin' && row.data.entityType === 'marketingSends').length, 1);
});

// ---------------------------------------------------------------------------------------------
// Change 7: editing orders
// ---------------------------------------------------------------------------------------------

test('order history is written by the server: who, when, field, old and new, and cannot be forged', async () => {
  const db = database();
  await saveWorkspaceMutation(admin, mutation('orders', orderData('ord_a', { editHistory: [{ timestamp: 'x', changedBy: 'Forged', note: 'fake' }] })));
  let row = db.records('orders')[0];
  assert.deepEqual(row.data.editHistory, []);
  await saveWorkspaceMutation(admin, mutation('orders', { ...row.data, address: 'Baneshwor', items: [item(product, 2), item(product2)], totalAmount: 1800,
    editHistory: [{ timestamp: 'x', changedBy: 'Forged', field: 'Address', oldValue: 'a', newValue: 'b' }], _edit: { token: 'e1', fields: ['address', 'items', 'totalAmount'] } }, row.version));
  row = db.records('orders')[0];
  const history = row.data.editHistory;
  assert.deepEqual(history.map((entry: any) => entry.field).sort(), ['Address', 'Products', 'Total']);
  assert.equal(history.every((entry: any) => entry.changedBy === 'Devansh' && entry.changedById === 'admin' && !Number.isNaN(Date.parse(entry.timestamp))), true);
  const products = history.find((entry: any) => entry.field === 'Products');
  assert.equal(products.oldValue, '1× Roll-On Peach'); assert.equal(products.newValue, '2× Roll-On Peach, 1× Body Wash');
  assert.equal(row.data._edit, undefined);
  assert.equal(JSON.stringify(history).includes('Forged'), false);
});

test('a reason is required only when the phone number or the date changes', async () => {
  const db = database();
  await saveWorkspaceMutation(admin, mutation('orders', orderData('ord_a')));
  const row = db.records('orders')[0];
  assert.equal(editNeedsReason(row.data, { ...row.data, address: 'Elsewhere' }), false);
  assert.equal(editNeedsReason(row.data, { ...row.data, customerPhone: '+977-9841234567' }), false); // same number, different format
  assert.equal(editNeedsReason(row.data, { ...row.data, orderDateAd: '2026-11-16' }), true);
  await assert.rejects(saveWorkspaceMutation(admin, mutation('orders', { ...row.data, customerPhone: '9800000001', _edit: { token: 'p1', fields: ['customerPhone'] } }, row.version)), /short reason/);
  await saveWorkspaceMutation(admin, mutation('orders', { ...row.data, customerPhone: '9800000001', _edit: { token: 'p1', fields: ['customerPhone'], reason: 'Customer gave a new number' } }, row.version));
  const entry = db.records('orders')[0].data.editHistory[0];
  assert.equal(entry.field, 'Phone'); assert.equal(entry.reason, 'Customer gave a new number');
});

test('changing the phone moves the order to the right customer and recounts both, without leaving a stray profile', async () => {
  const db = database();
  db.seed('customers', { id: 'c_old', phone: '9841234567', name: 'Sita Gurung', totalOrders: 2, lastOrderDate: '2026-11-17', brandsPurchased: ['FORYA'], karmaScore: 72 });
  db.seed('customers', { id: 'c_new', phone: '+977-9800000001', name: 'Maya Rai', totalOrders: 1, lastOrderDate: '2026-10-01', brandsPurchased: [], karmaScore: 80 });
  db.seed('orders', orderData('keep', { orderNumber: 'FOR-0001', orderDateAd: '2026-11-10' }));
  db.seed('orders', orderData('maya_old', { orderNumber: 'FOR-0002', customerPhone: '9800000001', orderDateAd: '2026-10-01' }));
  db.seed('orders', orderData('move', { orderNumber: 'FOR-0003' }));
  const row = db.records('orders').find((entry) => entry.id === 'move')!;
  await saveWorkspaceMutation(admin, mutation('orders', { ...row.data, customerPhone: '9800000001', customerName: 'Maya Rai', _edit: { token: 'm1', fields: ['customerPhone', 'customerName'], reason: 'Wrong number typed' } }, row.version));
  const customers = Object.fromEntries(db.records('customers').map((entry) => [entry.id, entry.data]));
  assert.equal(customers.c_old.totalOrders, 1); assert.equal(customers.c_old.lastOrderDate, '2026-11-10');
  assert.equal(customers.c_new.totalOrders, 2); assert.equal(customers.c_new.lastOrderDate, '2026-11-17'); assert.deepEqual(customers.c_new.brandsPurchased, ['FORYA']);
  assert.equal(customers.c_new.karmaScore, 80);
  // A typo that created a customer with no remaining order or history is removed when the order is corrected.
  db.seed('customers', { id: 'c_typo', phone: '9811111111', name: 'Typo', totalOrders: 1, brandsPurchased: ['FORYA'], karmaScore: 72 });
  db.seed('orders', orderData('typo_order', { orderNumber: 'FOR-0004', customerPhone: '9811111111' }));
  const typo = db.records('orders').find((entry) => entry.id === 'typo_order')!;
  await saveWorkspaceMutation(admin, mutation('orders', { ...typo.data, customerPhone: '9841234567', _edit: { token: 'm2', fields: ['customerPhone'], reason: 'Typo' } }, typo.version));
  assert.equal(db.records('customers').some((entry) => entry.id === 'c_typo'), false);
  assert.equal(db.records('customers').find((entry) => entry.id === 'c_old')!.data.totalOrders, 2);
  // Deleting an order recounts its customer too.
  const keep = db.records('orders').find((entry) => entry.id === 'keep')!;
  await saveWorkspaceMutation(admin, mutation('orders', keep.data, keep.version, 'delete'));
  assert.equal(db.records('customers').find((entry) => entry.id === 'c_old')!.data.totalOrders, 1);
});

test('two people editing the same order: the last save wins for its fields, both versions stay in history, and the other person is told', async () => {
  const db = database();
  db.tables.users.push(userRow({ ...admin, id: 'priya', fullName: 'Priya' }));
  const priya = { ...admin, id: 'priya', fullName: 'Priya' };
  await saveWorkspaceMutation(admin, mutation('orders', orderData('ord_a')));
  const opened = structuredClone(db.records('orders')[0]); // both people open version 1
  await saveWorkspaceMutation(priya, mutation('orders', { ...opened.data, address: 'Priya address', paymentTerms: 'Prepaid', _edit: { token: 'priya-1', fields: ['address', 'paymentTerms'] } }, opened.version));
  await saveWorkspaceMutation(admin, mutation('orders', { ...opened.data, address: 'Devansh address', _edit: { token: 'dev-1', fields: ['address'] } }, opened.version));
  const row = db.records('orders')[0];
  assert.equal(row.data.address, 'Devansh address'); // last save wins
  assert.equal(row.data.paymentTerms, 'Prepaid'); // a field the last person did not touch keeps the other person's value
  const address = row.data.editHistory.filter((entry: any) => entry.field === 'Address');
  assert.deepEqual(address.map((entry: any) => [entry.changedBy, entry.oldValue, entry.newValue]), [['Devansh', 'Priya address', 'Devansh address'], ['Priya', 'Thamel', 'Priya address']]);
  assert.equal(address[0].overwroteVersionBy, 'Priya');
  const notice = db.records('notifications').find((entry) => entry.data.userId === 'priya');
  assert.match(notice!.data.message, /Devansh saved a later change/);
  // A stale save that is not an edit from the form is still refused, as before.
  await assert.rejects(saveWorkspaceMutation(admin, mutation('orders', { ...opened.data, address: 'Stale device' }, opened.version)), /changed on another device/);
});

test('before and after lists exactly the fields that changed', () => {
  const before: any = orderData('o', { notes: '' });
  assert.deepEqual(diffOrder(before, { ...before }), []);
  const changes = diffOrder(before, { ...before, platform: 'Instagram', deliveryMethod: 'Yango', paymentTerms: 'Prepaid', notes: 'Call first', district: 'Lalitpur' });
  assert.deepEqual(changes.map((change) => change.field), ['District', 'Platform', 'Payment status', 'Delivery method', 'Remarks']);
});

// ---------------------------------------------------------------------------------------------
// Change 9: customer lookup
// ---------------------------------------------------------------------------------------------

const customers: any[] = [
  { id: 'c1', phone: '+977-9841234567', name: 'Sita Gurung', totalOrders: 4, lastOrderDate: '2026-11-12', karmaScore: 80, brandsPurchased: ['FORYA'] },
  { id: 'c2', phone: '9800001234', name: 'Maya Rai', totalOrders: 1, lastOrderDate: '2026-10-01', karmaScore: 60, brandsPurchased: [] },
  { id: 'c3', phone: '09812345670', name: 'Sitaram Thapa', totalOrders: 2, lastOrderDate: '2026-09-01', karmaScore: 50, brandsPurchased: [] },
];

test('phone lookup treats +977, spaces, dashes and a leading zero alike and suggests from the third digit', () => {
  for (const typed of ['+977 984-123-4567', '9779841234567', '09841234567', '984 123 4567']) assert.equal(phoneDigits(typed), '9841234567', typed);
  assert.equal(isFullPhone('+977-9841234567'), true); assert.equal(isFullPhone('984123456'), false); assert.equal(isFullPhone('9641234567'), false);
  assert.deepEqual(searchCustomers(customers, '98'), []); // two digits: nothing yet
  assert.deepEqual(searchCustomers(customers, '234567').map((match) => match.customer.id), ['c1', 'c3']); // the last six digits of a known number
  assert.deepEqual(searchCustomers(customers, 'sita').map((match) => match.customer.id), ['c1', 'c3']);
  assert.equal(searchCustomers(Array.from({ length: 20 }, (_, index) => ({ ...customers[0], id: `x${index}`, phone: `98412345${String(index).padStart(2, '0')}` })), '984123').length, 8);
  assert.equal(exactCustomer(customers, '984-123-4567')?.id, 'c1');
  assert.equal(exactCustomer(customers, '9841234'), undefined);
});

test('a number one digit away is offered as "did you mean", and a different name is flagged, never overwritten', () => {
  assert.deepEqual(nearMissCustomers(customers, '9841234568').map((customer) => customer.id), ['c1']);
  assert.deepEqual(nearMissCustomers(customers, '9841234567'), []); // an exact match is not a near miss
  assert.deepEqual(nearMissCustomers(customers, '9811111111'), []);
  assert.equal(namesDiffer('Sita G.', 'Sita Gurung'), true);
  assert.equal(namesDiffer('sita  gurung', 'Sita Gurung'), false);
  assert.equal(namesDiffer('', 'Sita Gurung'), false);
});

test('a review for a brand-new number creates the customer profile on the server; an unlinked entry creates none', async () => {
  const db = database();
  const reviewer: any = { ...marketer, id: 'rv', fullName: 'Reviews Staff', customPermissions: { reviews: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] } } };
  db.tables.users.push(userRow(reviewer));
  const entry = { id: 'fb1', customerName: 'New Person', customerPhone: '9822222222', customerLink: 'NEW', brandCode: 'FORYA', productId: 'p1', productName: 'x', type: 'REVIEW', channel: 'WhatsApp', dateReceivedAd: '2026-11-17', dateReceivedBs: '', fullText: 'Loved it', screenshotUrls: [], issueCategories: [], sentiment: 'POSITIVE', hasScreenshot: false, usedInDesign: false, postedOnWebsite: false, createdAt: '' };
  await saveWorkspaceMutation(reviewer, mutation('feedbackEntries', entry));
  const profile = db.records('customers').find((row) => phoneDigits(row.data.phone) === '9822222222')!;
  assert.equal(profile.data.name, 'New Person'); assert.equal(profile.data.totalReviews, 1); assert.equal(profile.data.totalOrders, 0);
  await saveWorkspaceMutation(reviewer, mutation('feedbackEntries', { ...entry, id: 'fb2', customerPhone: '', customerLink: 'UNLINKED', customerHandle: '@someone' }));
  assert.equal(db.records('customers').length, 1);
});

// ---------------------------------------------------------------------------------------------
// Changes 3 and 5: shared lists and permissions
// ---------------------------------------------------------------------------------------------

test('niche names are unique ignoring case; staff can add one in a form but only admins rename, archive or delete', async () => {
  const db = database();
  await saveWorkspaceMutation(marketer, mutation('influencerNiches', { id: 'niche_skincare', name: ' Skincare ' }));
  const saved = db.records('influencerNiches')[0];
  assert.equal(saved.data.name, 'Skincare'); assert.equal(saved.data.isArchived, false); assert.equal(saved.data.createdBy, 'Marketing Staff');
  await assert.rejects(saveWorkspaceMutation(marketer, mutation('influencerNiches', { id: 'niche_other', name: 'SKINCARE' })), /already exists/);
  await assert.rejects(saveWorkspaceMutation(marketer, mutation('influencerNiches', { ...saved.data, name: 'Skin care' }, saved.version)), /outside your permitted/);
  await saveWorkspaceMutation(admin, mutation('influencerNiches', { ...saved.data, name: 'Skin care' }, saved.version));
  // A niche used by an influencer cannot be deleted.
  db.seed('influencers', { id: 'inf1', name: 'Aashika', nicheIds: ['niche_skincare'] });
  const current = db.records('influencerNiches')[0];
  await assert.rejects(saveWorkspaceMutation(admin, mutation('influencerNiches', current.data, current.version, 'delete')), /used by at least one influencer/);
  // Reach-out and content platforms are two separate lists: the same name may exist in both.
  await saveWorkspaceMutation(marketer, mutation('marketingOptions', { id: 'reach_whatsapp', list: 'REACH_OUT', name: 'WhatsApp' }));
  await saveWorkspaceMutation(marketer, mutation('marketingOptions', { id: 'platform_whatsapp', list: 'CONTENT_PLATFORM', name: 'WhatsApp' }));
  await assert.rejects(saveWorkspaceMutation(marketer, mutation('marketingOptions', { id: 'reach_wa2', list: 'REACH_OUT', name: 'whatsapp' })), /already exists/);
});

test('every new record type is hidden and protected by the account’s saved permissions', () => {
  const row = (collection: any, id: string, data: any = {}, creator = 'admin'): StoredWorkspaceRecord => ({ collection, id, data: { id, ...data }, created_by: creator, version: 1 });
  const orderStaff: any = { id: 'os', fullName: 'Orders', assignedBrands: ['FORYA'], customPermissions: { orderflow: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] } } };
  const send = row('marketingSends', 's1', { brandCodes: ['FORYA'], responsibleId: 'mk', items: [] });
  assert.equal(canReadWorkspaceRecord(orderStaff, send, [], [send]), false); // no marketing access: invisible
  assert.equal(canWriteWorkspaceRecord(orderStaff, send, 'CREATE', [], [send]), false);
  assert.equal(canReadWorkspaceRecord(marketer, send, [], [send]), true);
  const viewOnly: any = { ...marketer, customPermissions: { marketing: { access: 'VIEW_ONLY', scope: 'ALL', actions: ['VIEW'] } } };
  assert.equal(canWriteWorkspaceRecord(viewOnly, send, 'CREATE', [], [send]), false);
  assert.equal(canWriteWorkspaceRecord(viewOnly, row('influencerNiches', 'n', { name: 'x' }), 'CREATE', [], []), false);
  const oneBrand: any = { ...marketer, assignedBrands: ['PEESAFE'] };
  assert.equal(canReadWorkspaceRecord(oneBrand, send, [], [send]), false); // another brand's send
  const ownScope: any = { ...marketer, id: 'own', customPermissions: { marketing: { access: 'FULL', scope: 'OWN', actions: ['VIEW', 'CREATE'] } } };
  assert.equal(canReadWorkspaceRecord(ownScope, send, [], [send]), false);
  assert.equal(canReadWorkspaceRecord({ ...ownScope, id: 'mk' }, send, [], [send]), true); // the responsible person
  // Delivery failure reasons belong to OrderFlow.
  assert.equal(canWriteWorkspaceRecord(orderStaff, row('failureReasons', 'r', { name: 'x' }), 'CREATE', [], []), true);
  assert.equal(canWriteWorkspaceRecord(marketer, row('failureReasons', 'r', { name: 'x' }), 'CREATE', [], []), false);
  // The setup-guide dismissal is personal: not even a Super Admin reads or writes another account's.
  const preference = row('userPreferences', 'mk', { setupGuideDismissedAt: 'now' }, 'mk');
  assert.equal(canReadWorkspaceRecord(marketer, preference, [], []), true);
  assert.equal(canReadWorkspaceRecord(admin, preference, [], []), false);
  assert.equal(canWriteWorkspaceRecord(admin, preference, 'EDIT', [], []), false);
});

// ---------------------------------------------------------------------------------------------
// Changes 4 and 5: content and reminders
// ---------------------------------------------------------------------------------------------

test('one reel keeps three platform links, a Drive link, a posted date and four products, and marks its send', () => {
  const db = new DatabaseService({ server: true }); db.replaceBrands([{ id: 'b1', code: 'FORYA', name: 'Forya' } as any]); db.replaceUsers([admin]);
  const four = [product, product2, { ...product, id: 'p3', name: 'Shampoo' }, { ...product, id: 'p4', name: 'Serum' }];
  db.hydrateSnapshot({ products: four as any, influencers: [{ id: 'inf1', name: 'Aashika', platforms: [], qualityRating: 'NOT_RATED', totalSends: 0, totalContent: 0, isActive: true, createdAt: '' }] as any }, admin);
  const send = db.createMarketingSend({ influencerId: 'inf1', brandCodes: ['FORYA'], reachOutPlatform: 'WhatsApp', responsibleId: 'admin', sentDateAd: '2026-11-01', sentDateBs: '', expectedContentDateAd: '2026-11-10', expectedContentDateBs: '', items: [{ productId: 'p1', productName: 'x', brandCode: 'FORYA', quantity: 1 }], deliveryChannel: 'Pathao' });
  assert.equal(sendStatusLabel(send, [], '2026-11-17'), 'Content overdue');
  assert.equal(sendIsOverdue(send, [], '2026-11-10'), false); // not overdue on the expected day itself
  const links = [{ platform: 'Instagram', url: 'https://www.instagram.com/reel/abc' }, { platform: 'TikTok', url: 'https://www.tiktok.com/@a/video/1', datePostedAd: '2026-11-13', datePostedBs: 'Kartik 27, 2083' }, { platform: 'YouTube', url: 'https://youtube.com/shorts/xyz' }];
  const saved = db.saveInfluencerContent({ influencerId: 'inf1', contentType: 'REEL', links, driveUrl: 'https://drive.google.com/file/d/123/view', datePostedAd: '2026-11-12', datePostedBs: 'Kartik 26, 2083',
    productIds: four.map((entry) => entry.id), productNames: four.map((entry) => entry.name), brandCodes: ['FORYA'], sendId: send.id, postStatus: 'LIVE', postStatusCheckedAd: '2026-11-17' });
  const reopened = db.getInfluencerContent('inf1').find((piece) => piece.id === saved.id)!;
  assert.deepEqual(reopened.links, links); assert.equal(reopened.driveUrl, 'https://drive.google.com/file/d/123/view');
  assert.equal(reopened.datePostedAd, '2026-11-12'); assert.equal(reopened.productIds!.length, 4); assert.equal(reopened.postStatus, 'LIVE');
  assert.equal(db.getMarketingSendById(send.id)!.status, 'CONTENT_RECEIVED');
  assert.equal(sendStatusLabel(db.getMarketingSendById(send.id)!, db.getInfluencerContent(), '2026-11-17'), 'Content received'); // linking clears the overdue badge
  assert.equal(isDriveLink('https://drive.google.com/file/d/1'), true); assert.equal(isDriveLink('https://dropbox.com/x'), false);
  // Older single-link content reads as one piece with one link.
  assert.deepEqual(contentLinks({ id: 'old', influencerId: 'inf1', contentType: 'REEL', url: 'https://instagram.com/p/1', platform: 'Instagram', datePostedAd: '2026-01-01', createdAt: '' }), [{ platform: 'Instagram', url: 'https://instagram.com/p/1' }]);
  assert.throws(() => validateWorkspaceMutation(mutation('influencerContent', { id: 'c', influencerId: 'inf1', links: [], datePostedAd: '2026-11-12' })), /at least one platform link/);
  assert.throws(() => validateWorkspaceMutation(mutation('influencerContent', { id: 'c', influencerId: 'inf1', links: [{ platform: 'Instagram', url: 'javascript:alert(1)' }], datePostedAd: '2026-11-12' })), /valid web address/);
});

// ---------------------------------------------------------------------------------------------
// Change 10: delivery failures
// ---------------------------------------------------------------------------------------------

test('a delivery failure marks the order Failed, is not a return, and a second attempt never duplicates the record', () => {
  const db = new DatabaseService({ server: true }); db.replaceBrands([{ id: 'b1', code: 'FORYA', name: 'Forya' } as any]); db.replaceUsers([admin]);
  db.hydrateSnapshot({ products: [product] as any, orders: [orderData('o1', { orderNumber: 'FOR-0001' })] as any,
    customers: [{ id: 'c1', phone: '+977-9841234567', name: 'Sita', city: '', province: '', totalOrders: 1, totalDelivered: 0, totalReturns: 0, totalDeliveryFailures: 0, totalCancellations: 0, totalComplaints: 0, totalReviews: 0, karmaScore: 72, segment: 'NEW', activeFlags: [], brandsPurchased: [] }] as any }, admin);
  const failure = db.addDeliveryFailure({ orderId: 'o1', orderNumber: 'FOR-0001', brandCode: 'FORYA', customerName: 'Sita', customerPhone: '9841234567', deliveryMethod: 'Pathao', dateAd: '2026-11-17', dateBs: '', reason: 'Area not serviceable', valley: 'Inside' });
  assert.equal(db.getOrderById('o1')!.status, 'FAILED');
  assert.equal(db.getReturns('ALL').length, 0);
  assert.equal(db.getCustomers()[0].totalDeliveryFailures, 1); // matched although the saved phone has another format
  assert.equal(db.getCustomers()[0].totalReturns, 0);
  assert.equal(db.getOpenDeliveryFailure('o1')!.id, failure.id);
  db.addDeliveryAttempt(failure.id, { dateAd: '2026-11-18', dateBs: '', reason: 'Call not received', reattemptDateAd: '2026-11-19', reattemptDateBs: '' });
  assert.equal(db.getDeliveryFailures('ALL').length, 1);
  const updated = db.getDeliveryFailures('ALL')[0];
  assert.equal(updated.attempts, 2); assert.equal(updated.attemptLog!.length, 2); assert.equal(updated.status, 'REATTEMPT_SCHEDULED');
  // The built-in reasons are offered until an admin saves their own, and new ones can be added inline.
  assert.equal(db.getFailureReasons().some((reason) => reason.name === 'Area not serviceable'), true);
  assert.equal(db.addFailureReason('Gate locked').name, 'Gate locked');
  assert.equal(db.addFailureReason('gate LOCKED').id, db.getFailureReasons().find((reason) => reason.name === 'Gate locked')!.id);
});

// ---------------------------------------------------------------------------------------------
// Data upgrade
// ---------------------------------------------------------------------------------------------

test('the data upgrade moves flagged orders into sends, numbers old orders oldest first, and is safe to run twice', async () => {
  const db = database();
  db.seed('influencers', { id: 'inf1', name: 'Aashika', category: 'Beauty', totalSends: 5, totalContent: 0, isActive: true, qualityRating: 'NOT_RATED', platforms: [] });
  db.seed('influencerContent', { id: 'cnt1', influencerId: 'inf1', url: 'https://instagram.com/reel/1', platform: 'Instagram', brandCode: 'FORYA', productName: 'Roll-On', contentType: 'REEL', datePostedAd: '2026-10-01', createdAt: '' });
  db.seed('orders', orderData('ord_b', { orderNumber: 'BB-MAN-2222', createdAt: '2026-10-02T05:00:00Z', orderDateAd: '2026-10-02' }));
  db.seed('orders', orderData('ord_a', { orderNumber: 'BB-MAN-1111', createdAt: '2026-10-01T05:00:00Z', orderDateAd: '2026-10-01', customerPhone: '9800000002' }));
  db.seed('orders', orderData('ord_c', { orderNumber: 'BB-WA-3333', createdAt: '2026-10-03T05:00:00Z', orderDateAd: '2026-10-03', brandCode: 'PEESAFE', items: [{ ...item(), brandCode: 'PEESAFE' }], customerPhone: '9800000003' }));
  db.seed('orders', orderData('mkt_1', { orderNumber: 'BB-MKT-0001', isMarketing: true, influencerId: 'inf1', customerName: 'Aashika (PR)', customerPhone: '9855555555', totalAmount: 0, contentReceived: true, createdAt: '2026-10-05T05:00:00Z', orderDateAd: '2026-10-05' }));
  db.seed('orders', orderData('mkt_2', { orderNumber: 'BB-MKT-0002', isMarketing: true, customerName: 'Unknown Creator (PR)', customerPhone: '9866666666', totalAmount: 0, items: [{ ...item(), productId: 'deleted_product' }], createdAt: '2026-10-06T05:00:00Z', orderDateAd: '2026-10-06' }));
  db.seed('customers', { id: 'c_mkt', phone: '9855555555', name: 'Aashika (PR)', totalOrders: 1, brandsPurchased: ['FORYA'], karmaScore: 72 });
  db.seed('deliveryFailures', { id: 'df1', orderId: 'ord_a', orderNumber: 'BB-MAN-1111', customerPhone: '9800000002' });
  db.seed('secondaryOrders', { id: 'so1', orderNumber: 'SO-20261001-4821', createdAt: '2026-10-01T05:00:00Z' });
  db.seed('dispatches', { id: 'dp1', createdAt: '2026-10-01T05:00:00Z', items: [] });
  db.products = new Set(['p1', 'p2']); // the database refuses records that point at a deleted product

  const plan = await planDataUpgrade();
  assert.deepEqual([plan.marketingOrders, plan.ordersWithoutShortId, plan.fieldOrdersWithoutShortId, plan.dispatchesWithoutNumber, plan.influencersWithoutNiches, plan.contentToConvert], [2, 3, 1, 1, 1, 1]);

  const first = await runDataUpgrade(admin);
  assert.deepEqual(first.failures, []);
  assert.equal(first.after.pending, 0);

  // Marketing orders are gone from orders and present as sends, each tied to an influencer.
  assert.equal(db.records('orders').some((row) => row.data.isMarketing), false);
  const sends = db.records('marketingSends').map((row) => row.data).sort((a, b) => a.sendNumber.localeCompare(b.sendNumber));
  assert.deepEqual(sends.map((send) => [send.sendNumber, send.legacyOrderNumber, send.status]), [['MS-0001', 'BB-MKT-0001', 'CONTENT_RECEIVED'], ['MS-0002', 'BB-MKT-0002', 'SENT']]);
  assert.equal(sends.every((send) => !('totalAmount' in send) && !('paymentTerms' in send) && send.items.every((line: any) => !('unitPrice' in line))), true);
  assert.equal(sends[0].influencerId, 'inf1');
  const created = db.records('influencers').find((row) => row.data.name === 'Unknown Creator')!;
  assert.equal(sends[1].influencerId, created.id);
  assert.equal(sends[1].items[0].productId, ''); assert.equal(sends[1].items[0].productName, 'Roll-On Peach'); // a deleted product keeps its name only
  // The customer that only existed because of a marketing order is recounted away.
  assert.equal(db.records('customers').some((row) => row.id === 'c_mkt'), false);
  // Influencer totals now come from real sends, and the old category became a niche.
  const aashika = db.records('influencers').find((row) => row.id === 'inf1')!.data;
  assert.equal(aashika.totalSends, 1); assert.deepEqual(aashika.nicheIds, ['niche_beauty']);
  assert.equal(db.records('influencerNiches')[0].data.name, 'Beauty');

  // Existing orders: oldest first within each brand prefix, old ID kept, references follow.
  const orders = Object.fromEntries(db.records('orders').map((row) => [row.id, row.data]));
  assert.deepEqual([orders.ord_a.orderNumber, orders.ord_b.orderNumber, orders.ord_c.orderNumber], ['FOR-0001', 'FOR-0002', 'PEE-0001']);
  assert.equal(orders.ord_a.legacyOrderNumber, 'BB-MAN-1111');
  assert.equal(db.records('deliveryFailures')[0].data.orderNumber, 'FOR-0001');
  assert.equal(db.records('secondaryOrders')[0].data.orderNumber, 'SO-0001');
  assert.equal(db.records('dispatches')[0].data.dispatchNumber, 'DP-0001');
  const content = db.records('influencerContent')[0].data;
  assert.deepEqual(content.links, [{ platform: 'Instagram', url: 'https://instagram.com/reel/1' }]); assert.equal(content.url, undefined); assert.deepEqual(content.productNames, ['Roll-On']);

  // Running it again changes nothing, and the next new order continues the counter.
  const snapshot = JSON.stringify(db.tables.workspace_records.filter((row) => !['activityLogs'].includes(row.collection)).map((row) => [row.collection, row.id, row.data, row.version]));
  const second = await runDataUpgrade(admin);
  assert.deepEqual(second.result, { sendsCreated: 0, influencersCreated: 0, ordersNumbered: 0, fieldOrdersNumbered: 0, dispatchesNumbered: 0, nichesLinked: 0, contentConverted: 0 });
  assert.equal(JSON.stringify(db.tables.workspace_records.filter((row) => !['activityLogs'].includes(row.collection)).map((row) => [row.collection, row.id, row.data, row.version])), snapshot);
  db.products = null;
  await saveWorkspaceMutation(admin, mutation('orders', orderData('ord_new', { customerPhone: '9800000007' })));
  assert.equal(db.records('orders').find((row) => row.id === 'ord_new')!.data.orderNumber, 'FOR-0003');
});

// ---------------------------------------------------------------------------------------------
// Follow-up checks added in the 17 November audit
// ---------------------------------------------------------------------------------------------

test('shared agency links show the order’s current short ID on failure and return rows', () => {
  const db = new DatabaseService({ server: true });
  db.replaceBrands([{ id: 'b1', code: 'FORYA', name: 'Forya', color: '#000', description: '' } as any]); db.replaceUsers([admin]);
  db.hydrateSnapshot({ products: [product] as any, orders: [orderData('o1', { orderNumber: 'FOR-0421', legacyOrderNumber: 'ORD-1731822000-ABCD' })] as any,
    deliveryFailures: [{ id: 'f1', orderId: 'o1', orderNumber: 'ORD-1731822000-ABCD', brandCode: 'FORYA', customerName: 'Sita Gurung', customerPhone: '9841234567', dateAd: '2026-11-17', dateBs: '', reason: 'Call not received', valley: 'Inside', attempts: 1, status: 'FAILED' }] as any,
    returns: [{ id: 'r1', orderNumber: 'FOR-0099', brandCode: 'FORYA', productId: 'p1', productName: product.name, customerName: 'Sita Gurung', customerPhone: '9841234567', dateAd: '2026-11-17', dateBs: '', reasonCategory: 'Damaged', orderStatus: 'RETURNED' }] as any }, admin);
  const link: any = { id: 'l', token: 't', name: 'Agency', isActive: true, brandScope: 'ALL', brandFilter: [], allowedPages: ['delivery-failures', 'returns'], dateRangeType: 'LIVE', showCustomerDetails: false, showStaffDetails: false, showOrderRows: true, showProductNames: false, showComboDetails: false, accessCount: 0, createdAt: '' };
  const portal = projectSharedPortal(db, link);
  // The failure was logged before the upgrade with the long ID; the link shows the order's short ID now.
  assert.equal(portal.deliveryFailures![0].orderNumber, 'FOR-0421');
  // A return with no linked order keeps the ID it was saved with.
  assert.equal(portal.returns![0].orderNumber, 'FOR-0099');
  // Customer details stay hidden when the link does not allow them.
  assert.equal(portal.deliveryFailures![0].customerPhone, 'Hidden');
});

// ---------------------------------------------------------------------------------------------
// 17 November follow-ups: combos on sends, a written reason for "Other"
// ---------------------------------------------------------------------------------------------

test('a marketing send can include a combo alongside products, and never changes sales numbers', () => {
  const db = new DatabaseService({ server: true });
  db.replaceBrands([{ id: 'b1', code: 'FORYA', name: 'Forya', color: '#000', description: '' } as any]); db.replaceUsers([admin]);
  const combo = { id: 'cmb1', brandCode: 'FORYA', name: 'Fresh Duo', sku: 'DUO', description: '', items: [{ productId: 'p1', productName: product.name, quantity: 1, mrp: 500 }, { productId: 'p2', productName: product2.name, quantity: 1, mrp: 800 }],
    totalOriginalMrp: 1300, comboPrice: 1100, savingsPct: 15, active: true, createdAt: '' };
  db.hydrateSnapshot({ products: [product, product2] as any, combos: [combo] as any, orders: [orderData('o1', { orderNumber: 'FOR-0001' })] as any,
    influencers: [{ id: 'inf1', name: 'Aashika', platforms: [], qualityRating: 'NOT_RATED', totalSends: 0, totalContent: 0, isActive: true, createdAt: '' }] as any }, admin);
  const ordersBefore = db.getOrders().length;
  const send = db.createMarketingSend({ influencerId: 'inf1', brandCodes: ['FORYA'], reachOutPlatform: 'Instagram DM', responsibleId: 'admin', sentDateAd: '2026-11-17', sentDateBs: '',
    items: [{ productId: 'p1', productName: product.name, brandCode: 'FORYA', quantity: 2 }, { productId: 'cmb1', productName: 'Fresh Duo', brandCode: 'FORYA', quantity: 1, isCombo: true }], deliveryChannel: 'Pathao' });
  assert.equal(send.items[1].isCombo, true);
  assert.equal(send.items[0].isCombo, undefined); // product lines carry no combo flag
  assert.equal(db.getOrders().length, ordersBefore);
  const tab = buildGoogleReportTabs(db, '2026-11', new Date('2026-11-17T06:00:00Z')).find((entry) => entry.title === 'Marketing Sends')!;
  assert.match(String(tab.values[1][4]), /1x Fresh Duo \(combo\)/);
  assert.equal(tab.values[0][1], 'Sent Date (AD)');
  // The server accepts a combo line and still refuses any price on it.
  assert.doesNotThrow(() => validateWorkspaceMutation(mutation('marketingSends', { ...send, id: 'send_x' })));
  assert.throws(() => validateWorkspaceMutation(mutation('marketingSends', { ...send, id: 'send_y', items: [{ ...send.items[1], unitPrice: 1100 }] })), /price, payment or order/);
});

test('a delivery failure with reason Other needs a written reason, which shows wherever the reason does', () => {
  const db = new DatabaseService({ server: true }); db.replaceBrands([{ id: 'b1', code: 'FORYA', name: 'Forya' } as any]); db.replaceUsers([admin]);
  db.hydrateSnapshot({ products: [product] as any, orders: [orderData('o1', { orderNumber: 'FOR-0001' })] as any }, admin);
  const base = { orderId: 'o1', orderNumber: 'FOR-0001', brandCode: 'FORYA', customerName: 'Sita', customerPhone: '9841234567', deliveryMethod: 'Pathao' as any, dateAd: '2026-11-17', dateBs: '', valley: 'Inside' as const };
  assert.throws(() => db.addDeliveryFailure({ ...base, reason: 'Other' }), /Write the reason/);
  assert.throws(() => db.addDeliveryFailure({ ...base, reason: 'other', reasonDetail: '   ' }), /Write the reason/);
  const failure = db.addDeliveryFailure({ ...base, reason: 'Other', reasonDetail: 'Rider could not reach, road closed' });
  // The reason stays "Other" so the reason chart keeps one bucket; the text travels with it.
  assert.equal(failure.reason, 'Other');
  assert.equal(failureReasonLabel(failure), 'Other: Rider could not reach, road closed');
  assert.equal(failure.attemptLog![0].reasonDetail, 'Rider could not reach, road closed');
  // A later attempt with a different reason drops the old explanation; another "Other" needs its own.
  assert.throws(() => db.addDeliveryAttempt(failure.id, { dateAd: '2026-11-18', dateBs: '', reason: 'Other' }), /Write the reason/);
  db.addDeliveryAttempt(failure.id, { dateAd: '2026-11-18', dateBs: '', reason: 'Call not received' });
  assert.equal(db.getDeliveryFailures('ALL')[0].reasonDetail, undefined);
  assert.equal(db.getDeliveryFailures('ALL')[0].attemptLog![0].reasonDetail, 'Rider could not reach, road closed'); // history keeps it
  // Shared agency links show the written reason.
  const link: any = { id: 'l', token: 't', name: 'Agency', isActive: true, brandScope: 'ALL', brandFilter: [], allowedPages: ['delivery-failures'], dateRangeType: 'LIVE', showCustomerDetails: false, showStaffDetails: false, showOrderRows: true, showProductNames: false, showComboDetails: false, accessCount: 0, createdAt: '' };
  const other = new DatabaseService({ server: true }); other.replaceBrands([{ id: 'b1', code: 'FORYA', name: 'Forya' } as any]); other.replaceUsers([admin]);
  other.hydrateSnapshot({ orders: [orderData('o1', { orderNumber: 'FOR-0001' })] as any, deliveryFailures: [{ ...base, id: 'f1', reason: 'Other', reasonDetail: 'Gate locked', createdAt: '' }] as any }, admin);
  assert.equal(projectSharedPortal(other, link).deliveryFailures![0].reason, 'Other: Gate locked');
});

test('the server refuses a new "Other" failure without a written reason but still updates older ones', () => {
  const context: any = { users: [admin], brands: [{ code: 'FORYA' }], records: [] };
  const row = { id: 'df_new', orderId: 'o1', orderNumber: 'FOR-0001', brandCode: 'FORYA', customerName: 'Sita', customerPhone: '9841234567', deliveryMethod: 'Pathao', dateAd: '2026-11-17', dateBs: '', reason: 'Other', valley: 'Inside', attempts: 1, status: 'FAILED', createdAt: '' };
  assert.throws(() => prepareRecordData(admin, mutation('deliveryFailures', row) as any, null, context), /Write the reason/);
  assert.doesNotThrow(() => prepareRecordData(admin, mutation('deliveryFailures', { ...row, reasonDetail: ' Gate locked ' }) as any, null, context));
  assert.throws(() => prepareRecordData(admin, mutation('deliveryFailures', { ...row, reasonDetail: 'x'.repeat(301) }) as any, null, context), /under 300/);
  // A failure saved as "Other" before this rule can still have its status changed.
  const prior: any = { collection: 'deliveryFailures', id: 'df_new', data: row, created_by: 'admin', version: 1 };
  assert.doesNotThrow(() => prepareRecordData(admin, mutation('deliveryFailures', { ...row, status: 'DELIVERED' }, 1) as any, prior, context));
  assert.equal(isOtherReason('Others'), true); assert.equal(isOtherReason('Other courier'), false);
});

// ---------------------------------------------------------------------------------------------
// Order status, exchanges and the Order Desk (17 November, second round)
// ---------------------------------------------------------------------------------------------

const customerRow = (extra: Record<string, unknown> = {}) => ({ id: 'c1', phone: '9841234567', name: 'Sita Gurung', city: '', province: '', totalOrders: 1, totalDelivered: 0, totalReturns: 0, totalDeliveryFailures: 0, totalCancellations: 0, totalComplaints: 0, totalReviews: 0, karmaScore: 72, segment: 'NEW', activeFlags: [], brandsPurchased: ['FORYA'], ...extra });
function statusWorkspace(user: any = admin) {
  const db = new DatabaseService({ server: true }); db.replaceBrands([{ id: 'b1', code: 'FORYA', name: 'Forya' } as any]); db.replaceUsers([admin, user]);
  db.hydrateSnapshot({ products: [product, product2] as any, orders: [orderData('o1', { orderNumber: 'FOR-0001', status: 'PENDING' })] as any, customers: [customerRow()] as any }, user);
  return db;
}

test('orders can be marked dispatched and delivered, which updates the customer once and closes an open failure', () => {
  const db = statusWorkspace();
  db.setOrderStatus('o1', 'DISPATCHED', { dateAd: '2026-11-17' });
  assert.equal(db.getOrderById('o1')!.status, 'DISPATCHED'); assert.equal(db.getOrderById('o1')!.dispatchedDateAd, '2026-11-17');
  const failure = db.addDeliveryFailure({ orderId: 'o1', orderNumber: 'FOR-0001', brandCode: 'FORYA', customerName: 'Sita', customerPhone: '9841234567', deliveryMethod: 'Pathao', dateAd: '2026-11-18', dateBs: '', reason: 'Call not received', valley: 'Inside' });
  assert.equal(db.getOrderById('o1')!.status, 'FAILED');
  const before = db.getCustomers()[0].karmaScore;
  db.setOrderStatus('o1', 'DELIVERED', { dateAd: '2026-11-19' });
  const order = db.getOrderById('o1')!;
  assert.equal(order.status, 'DELIVERED'); assert.equal(order.deliveredDateAd, '2026-11-19');
  assert.equal(db.getCustomers()[0].totalDelivered, 1); assert.equal(db.getCustomers()[0].karmaScore, before + 1);
  assert.equal(db.getDeliveryFailures('ALL').find((entry) => entry.id === failure.id)!.status, 'DELIVERED');
  // Undoing a wrong click takes the count and point back; the history keeps both changes.
  db.setOrderStatus('o1', 'DISPATCHED');
  assert.equal(db.getCustomers()[0].totalDelivered, 0); assert.equal(db.getCustomers()[0].karmaScore, before);
  assert.ok((db.getOrderById('o1')!.editHistory || []).some((entry: any) => entry.field === 'Status'));
  assert.throws(() => db.setOrderStatus('o1', 'CANCELLED'), /reason/);
  db.setOrderStatus('o1', 'CANCELLED', { reason: 'Customer changed mind' });
  assert.equal(db.getCustomers()[0].totalCancellations, 1);
});

test('marking a delivery failure delivered now delivers the order and applies karma (it was computed and dropped before)', () => {
  const db = statusWorkspace();
  const failure = db.addDeliveryFailure({ orderId: 'o1', orderNumber: 'FOR-0001', brandCode: 'FORYA', customerName: 'Sita', customerPhone: '9841234567', deliveryMethod: 'Pathao', dateAd: '2026-11-18', dateBs: '', reason: 'Call not received', valley: 'Inside' });
  const before = { ...db.getCustomers()[0] };
  db.updateDeliveryFailure(failure.id, { status: 'DELIVERED' });
  assert.equal(db.getOrderById('o1')!.status, 'DELIVERED');
  assert.equal(db.getCustomers()[0].totalDelivered, before.totalDelivered + 1);
  assert.equal(db.getCustomers()[0].karmaScore, before.karmaScore + 1);
});

test('a return resolved as an exchange creates or links the replacement order, which never adds sales and feeds the analysis', () => {
  const db = statusWorkspace();
  db.setOrderStatus('o1', 'DELIVERED', { dateAd: '2026-11-17' });
  const ret = db.addReturn({ orderId: 'o1', orderNumber: 'FOR-0001', brandCode: 'FORYA', productId: 'p1', productName: product.name, customerName: 'Sita Gurung', customerPhone: '9841234567', dateAd: '2026-11-18', dateBs: '', orderProcessedDateAd: '2026-11-17', platform: 'WhatsApp' as any, quantity: 1, reasonCategory: 'Damage' as any, orderStatus: 'Exchanged', valley: 'Inside', issueCategories: [] });
  assert.equal(exchangeAnalysis(db.getReturns('ALL'), db.getOrders('ALL')).unlinked, 1);
  const karma = db.getCustomers()[0].karmaScore;
  const replacement = db.createExchangeOrder(ret.id, { items: [{ productId: 'p2', productName: product2.name, brandCode: 'FORYA', quantity: 1 }], amountToCollect: 300 });
  assert.equal(replacement.totalAmount, 300); assert.equal(replacement.items.reduce((sum, item) => sum + item.totalPrice, 0), 300);
  assert.equal(replacement.exchangeReturnId, ret.id); assert.equal(replacement.exchangeOfOrderId, 'o1'); assert.equal(replacement.address, 'Thamel');
  assert.equal(db.getCustomers()[0].karmaScore, karma); // no "order placed" karma for a replacement
  const saved = db.getReturns('ALL').find((entry) => entry.id === ret.id)!;
  assert.equal(saved.exchangeOrderId, replacement.id); assert.equal(exchangeNeedsLink(saved), false);
  assert.throws(() => db.createExchangeOrder(ret.id, { items: [{ productId: 'p1', productName: product.name, brandCode: 'FORYA', quantity: 1 }], amountToCollect: 0 }), /already has a replacement/);
  db.setOrderStatus(replacement.id, 'DELIVERED', { dateAd: '2026-11-21' });
  const a = exchangeAnalysis(db.getReturns('ALL'), db.getOrders('ALL'));
  assert.equal(a.byResolution.Exchanged, 1); assert.equal(a.linked, 1); assert.equal(a.unlinked, 0); assert.equal(a.replacementsDelivered, 1);
  assert.equal(a.differenceCollected, 300); assert.equal(a.medianDaysReturnToReplacementDelivered, 3);
  assert.deepEqual(a.swaps, [{ from: product.name, to: product2.name, count: 1 }]);
  // Changing the resolution away from Exchanged unlinks both sides.
  db.updateReturnResolution(ret.id, 'Refunded');
  assert.equal(db.getReturns('ALL').find((entry) => entry.id === ret.id)!.exchangeOrderId, undefined);
  assert.equal(db.getOrderById(replacement.id)!.exchangeReturnId, undefined);
  // Linking: same customer only, never the returned order itself.
  assert.throws(() => db.linkExchangeOrder(ret.id, 'o1'), /not the order that was returned/);
  db.linkExchangeOrder(ret.id, replacement.id);
  assert.equal(db.getReturns('ALL').find((entry) => entry.id === ret.id)!.orderStatus, 'Exchanged');
});

test('the Order Desk works orders and returns without OrderFlow, but cannot change order details or create ordinary orders', () => {
  const desk: any = { id: 'desk', fullName: 'Desk Staff', email: '', phone: '', role: 'CUSTOM', active: true, assignedBrands: ['ALL'], permissions: {},
    customPermissions: { order_desk: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT'] } } };
  const stored = (collection: string, data: any): StoredWorkspaceRecord => ({ collection: collection as any, id: data.id, data, created_by: 'admin', version: 1 });
  const order = stored('orders', orderData('o1', { orderNumber: 'FOR-0001' }));
  assert.equal(canReadWorkspaceRecord(desk, order, [admin, desk], []), true);
  assert.equal(canWriteWorkspaceRecord(desk, order, 'EDIT', [admin, desk], []), true);
  assert.equal(canWriteWorkspaceRecord(desk, order, 'DELETE', [admin, desk], []), false);
  assert.equal(canWriteWorkspaceRecord(desk, stored('orders', orderData('o2')), 'CREATE', [admin, desk], []), false);
  assert.equal(canWriteWorkspaceRecord(desk, stored('orders', orderData('o3', { exchangeReturnId: 'ret_1' })), 'CREATE', [admin, desk], []), true);
  assert.equal(canWriteWorkspaceRecord(desk, stored('returns', { id: 'ret_1', brandCode: 'FORYA', customerPhone: '9841234567' }), 'CREATE', [admin, desk], []), true);
  assert.equal(canReadWorkspaceRecord(desk, stored('marketingSends', { id: 's1', brandCodes: ['FORYA'] }), [admin, desk], []), false);
  // On the server: status changes pass, detail changes do not.
  const context: any = { users: [admin, desk], brands: [{ code: 'FORYA' }], records: [{ collection: 'products', id: 'p1', data: product, created_by: 'admin', version: 1 }] };
  assert.doesNotThrow(() => prepareRecordData(desk, mutation('orders', { ...order.data, status: 'DELIVERED', deliveredDateAd: '2026-11-17' }, 1) as any, order, context));
  assert.throws(() => prepareRecordData(desk, mutation('orders', { ...order.data, address: 'Somewhere else' }, 1) as any, order, context), /delivery status and exchanges/);
  assert.throws(() => prepareRecordData(desk, mutation('orders', orderData('o9', { assignedToId: 'desk' })) as any, null, context), /replacement order for a logged return/);
  // Desk-only staff land on All Orders after signing in.
  assert.equal(getRedirectPathForUser(desk), '/orderflow/orders');
});

test('customer cohorts and lifecycle moves come from real order dates, with phones normalised', () => {
  const o = (id: string, phone: string, date: string, extra: Record<string, unknown> = {}) => orderData(id, { customerPhone: phone, orderDateAd: date, ...extra }) as any;
  const orders = [
    o('a1', '9841000001', '2026-09-03'), o('a2', '+977-9841000001', '2026-10-10'), // same person, two formats
    o('b1', '9841000002', '2026-09-20'),
    o('c1', '9841000003', '2026-10-05'), o('c2', '9841000003', '2026-11-10'),
    o('d1', '9841000004', '2026-06-01'), o('d2', '9841000004', '2026-11-12'), // won back after a long gap
    o('x1', '9841000005', '2026-11-01', { status: 'CANCELLED' }), // not a purchase
    o('r1', '9841000006', '2026-11-02', { exchangeReturnId: 'ret_1' }), // a replacement, not a purchase
  ];
  const rows = cohortRetention(orders, '2026-11-17');
  const sep = rows.find((row) => row.month.startsWith('Sep 2026'))!;
  assert.equal(sep.size, 2); assert.equal(sep.m1, '50%'); assert.equal(sep.m2, '0%'); assert.equal(sep.m3, '—');
  const oct = rows.find((row) => row.month.startsWith('Oct 2026'))!;
  assert.equal(oct.size, 1); assert.equal(oct.m1, '100%');
  assert.equal(rows.some((row) => row.month.startsWith('Nov 2026')), false); // cancelled and replacement orders start no cohort
  const moves = Object.fromEntries(lifecycleMovements(orders, '2026-11-17').map((move) => [move.to, move.count]));
  assert.equal(moves.Repeat, 2); // c (Nov 10) and d (Nov 12)
  assert.equal(moves['Won back'], 1);
  assert.equal(moves.Lapsed, 0);
});

test('cancelling after a failed delivery cancels the order and counts it on the customer', () => {
  const db = statusWorkspace();
  const failure = db.addDeliveryFailure({ orderId: 'o1', orderNumber: 'FOR-0001', brandCode: 'FORYA', customerName: 'Sita', customerPhone: '9841234567', deliveryMethod: 'Pathao', dateAd: '2026-11-18', dateBs: '', reason: 'Customer refused', valley: 'Inside' });
  db.updateDeliveryFailure(failure.id, { status: 'CANCELLED' });
  assert.equal(db.getOrderById('o1')!.status, 'CANCELLED');
  assert.equal(db.getCustomers()[0].totalCancellations, 1);
  assert.equal(countsAsSale(db.getOrderById('o1')!), false);
});

test('online and marketing screens use AD; offline field sales show BS and AD; elsewhere the user decides', () => {
  assert.equal(calendarScopeForPath('/orderflow/orders'), 'D2C');
  assert.equal(calendarScopeForPath('/reviews/returns'), 'D2C');
  assert.equal(calendarScopeForPath('/marketing/influencers/inf1'), 'D2C');
  assert.equal(calendarScopeForPath('/customers/9841234567'), 'D2C');
  assert.equal(calendarScopeForPath('/offline-sales/cheques'), 'B2B');
  assert.equal(calendarScopeForPath('/dashboard'), 'USER');
  assert.equal(calendarScopeForPath('/orderflowx'), 'USER');
  assert.equal(scopedDate('D2C', '2026-11-17', 'Kartik 30, 2083'), '2026-11-17');
  assert.equal(scopedDate('B2B', '2026-11-17', 'Kartik 30, 2083'), 'Kartik 30, 2083 (2026-11-17)');
});
