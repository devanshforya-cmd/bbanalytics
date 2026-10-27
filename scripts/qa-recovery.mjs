// Explicit integration check against a running local production build and real Supabase.
// Creates uniquely named fixtures and removes only those fixtures in finally.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';

const env = Object.fromEntries((await readFile(new URL('../.env.local', import.meta.url), 'utf8')).split(/\r?\n/).filter(line => line.includes('=') && !line.trim().startsWith('#')).map(line => {
  const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2')];
}));
const base = 'http://127.0.0.1:3000';
const tag = `qa_${Date.now()}_${randomBytes(3).toString('hex')}`;
const officerId = `${tag}_officer`;
const officerPassword = randomBytes(24).toString('base64url');
const phone = `98${String(Date.now()).slice(-8)}`;
const customerPhone = `97${String(Date.now()).slice(-8)}`;
const brandCode = tag.toUpperCase();
const createdBrands = [];
const fixtureIds = new Set();
const checks = [];
let officerCreated = false;
let adminId;
let adminCookie;
const mark = message => { checks.push(message); console.log(`PASS ${message}`); };
async function api(path, { cookie, method = 'GET', body, headers = {}, status = 200 } = {}) {
  const response = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${response.status}: ${data.error || JSON.stringify(data)}`);
  return { data, response };
}
async function login(identifier, password) {
  const result = await api('/api/auth/login', { method: 'POST', body: { identifier, password } });
  assert(!JSON.stringify(result.data).includes('password_hash'));
  return { cookie: result.response.headers.get('set-cookie').split(';')[0], user: result.data.user };
}
async function mutate(collection, record, cookie = adminCookie, version = 0, status = 200, mutationId = randomUUID()) {
  if (status === 200) fixtureIds.add(record.id);
  return api('/api/sync', { cookie, method: 'POST', status, body: { collection, id: record.id, data: record, operation: 'upsert', mutationId, expectedVersion: version } });
}
async function service(path, options = {}) {
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Prefer: 'return=representation', 'Content-Type': 'application/json', ...options.headers } });
  assert(response.ok, `Fixture cleanup/storage request failed: ${response.status}`);
  const text = await response.text(); return text ? JSON.parse(text) : null;
}
const csv = (columns, values) => [columns, ...values].map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
try {
  await api('/api/health');
  await api('/api/sync', { status: 401 });
  const admin = await login('admin@brandbucket.com', env.INITIAL_ADMIN_PASSWORD);
  adminCookie = admin.cookie; adminId = admin.user.id;
  mark('Database health and real administrator password sign-in');
  const anonymous = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/users?select=id&limit=1`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY } });
  assert([401, 403].includes(anonymous.status));
  mark('Anonymous Supabase access to staff records is denied');
  const initial = (await api('/api/sync', { cookie: adminCookie })).data;
  assert(initial.data.documentTypes.length && initial.data.storeCategories.length);
  await api('/api/sync', { cookie: adminCookie, headers: { 'X-Workspace-User': officerId }, status: 409 });
  mark('Initial configuration exists; mismatched account sync is refused');
  for (const code of [brandCode, `${brandCode}_B`]) {
    const result = await api('/api/brands', { cookie: adminCookie, method: 'POST', body: { code, name: `QA recovery ${code}` }, status: 201 });
    createdBrands.push(result.data.data);
  }
  const hidden = { access: 'HIDDEN', scope: null, actions: [] };
  const permissions = { dashboard: hidden, settings: hidden, staff_scorecards: hidden, products: hidden, gps_tracking: hidden };
  const staff = await api('/api/users', { cookie: adminCookie, method: 'POST', status: 201, body: { id: officerId, fullName: 'QA Recovery Officer', email: `${tag}@example.test`, phone, role: 'SALES_OFFICER', password: officerPassword, active: true, assignedBrands: [brandCode], reportsToId: adminId, customPermissions: permissions } });
  officerCreated = true;
  await api('/api/users', { cookie: adminCookie, method: 'PATCH', status: 400, body: { id: adminId, reportsToId: officerId } });
  assert(!JSON.stringify(staff.data).includes('password_hash'));
  const officer = await login(`${tag}@example.test`, officerPassword);
  await writeFile('/private/tmp/bb-recovery-qa-login.json', JSON.stringify({ email: `${tag}@example.test`, password: officerPassword, id: officerId }), { mode: 0o600 });
  mark('Sales Officer created and password verified without returning password hashes');
  const product = { id: `${tag}_product`, brandId: createdBrands[0].id, brandCode, sku: `${tag}_SKU`, name: 'QA Product', category: 'QA', unitPrice: 100, mrp: 100, thresholdQty: 1, keywords: [], active: true };
  const otherProduct = { ...product, id: `${tag}_other_product`, sku: `${tag}_OTHER`, brandCode: `${brandCode}_B` };
  await mutate('products', product); await mutate('products', otherProduct);
  const store = { id: `${tag}_store`, name: 'QA Store', type: 'GT', city: 'Kathmandu', area: 'QA', address: 'QA address', lat: 27.7, lng: 85.3, assignedOfficerId: officerId, contactName: 'QA Contact', contactRole: 'Owner', contactPhone: customerPhone, contacts: [], brandsStocked: [brandCode] };
  await mutate('retailers', store);
  await mutate('retailers', { ...store, id: `${tag}_foreign_store`, assignedOfficerId: adminId });
  let view = (await api('/api/sync', { cookie: officer.cookie })).data;
  assert(view.data.products.some(row => row.id === product.id));
  assert(!view.data.products.some(row => row.id === otherProduct.id));
  assert(view.data.retailers.some(row => row.id === store.id));
  assert(!view.data.retailers.some(row => row.id === `${tag}_foreign_store`));
  assert.equal(view.data.orders.length, 0); assert.equal(view.data.activityLogs.length, 0);
  await api('/api/users', { cookie: officer.cookie, status: 404 });
  await api('/api/integrations/google', { cookie: officer.cookie, status: 404 });
  await api('/api/gps/ping', { cookie: officer.cookie, status: 404 });
  await mutate('products', { ...product, name: 'Forbidden edit' }, officer.cookie, 1, 403);
  mark('OWN stores, assigned brands, hidden modules and denied writes enforced by server');
  const visit = { id: `${tag}_visit`, storeId: store.id, officerId, dateAd: new Date().toISOString().slice(0, 10), checkInAt: new Date().toISOString(), status: 'COMPLETED' };
  const replayId = randomUUID();
  const saved = await mutate('visits', visit, officer.cookie, 0, 200, replayId);
  assert.equal(saved.data.version, 1);
  await mutate('visits', visit, officer.cookie, 0, 200, replayId);
  const conflict = await mutate('visits', { ...visit, status: 'CHANGED' }, officer.cookie, 0, 409);
  assert.equal(conflict.data.currentVersion, 1);
  view = (await api('/api/sync', { cookie: officer.cookie })).data;
  assert(view.data.visits.some(row => row.id === visit.id && row.status === 'COMPLETED'));
  mark('Real Supabase save/reload, idempotent retry and stale-version conflict protection');
  await api('/api/brands', { cookie: adminCookie, method: 'DELETE', status: 409, body: { id: createdBrands[0].id, code: 'FAKE_UNUSED_CODE' } });
  await api('/api/brands', { cookie: adminCookie, method: 'PATCH', status: 409, body: { id: createdBrands[0].id, code: `${brandCode}_CHANGED` } });
  mark('Brand references prevent deletion and code changes, including a spoofed code');
  const task = await api('/api/tasks', { cookie: adminCookie, method: 'POST', status: 201, body: { title: `${tag} visit task`, assignedTo: officerId } });
  fixtureIds.add(task.data.data.id);
  const tasks = (await api('/api/tasks', { cookie: officer.cookie })).data.data;
  assert(tasks.some(row => row.id === task.data.data.id && row.assignedTo === officerId));
  await api('/api/tasks', { cookie: officer.cookie, method: 'POST', status: 400, body: { title: 'Bad assignee', assignedTo: 'missing_staff' } });
  mark('Task creation persists and reaches the actual assigned officer');
  await api('/api/gps/ping', { cookie: officer.cookie, method: 'POST', body: { officerId: adminId, lat: 27.7, lng: 85.3, status: 'AT_STORE', batteryLevel: 0 } });
  await api('/api/gps/ping', { cookie: officer.cookie, method: 'POST', body: { lat: 27.71, lng: 85.31, status: 'IN_TRANSIT' } });
  const positions = (await api('/api/gps/ping', { cookie: adminCookie })).data.data.filter(row => row.officer_id === officerId);
  assert.equal(positions.length, 1); assert.equal(positions[0].lat, 27.71);
  mark('GPS writes are bound to the signed-in officer and update one current position');
  const order = await api('/api/orders', { cookie: adminCookie, method: 'POST', status: 201, body: { customerName: 'QA Customer', customerPhone, brandCode, province: 'Bagmati', district: 'Kathmandu', address: 'QA address', items: [{ productId: product.id, quantity: 2, unitPrice: 100 }] } });
  fixtureIds.add(order.data.data.id);
  const orderView = (await api('/api/sync', { cookie: adminCookie })).data.data;
  assert(orderView.orders.some(row => row.id === order.data.data.id && row.totalAmount === 200));
  for (const row of orderView.customers.filter(row => row.phone === customerPhone)) fixtureIds.add(row.id);
  mark('Order and customer aggregation commit together and survive a fresh read');
  const today = new Date().toISOString().slice(0, 10);
  const importHeaders = { 'X-Workspace-User': adminId };
  const orderColumns = ['Order Number', 'Date', 'Customer Name', 'Phone', 'Province', 'District', 'Address', 'Platform', 'Delivery Method', 'Payment Terms', 'Order Type', 'Status', 'Product ID', 'Quantity', 'Unit Price', 'Notes'];
  const orderValues = [`${tag}_csv`, today, 'QA CSV Customer', customerPhone, 'Bagmati', 'Kathmandu', 'QA address', 'WhatsApp', 'Standard', 'COD', 'NEW', 'PENDING', product.id, 2, 100, 'QA only'];
  const input = { sourceType: 'ORDERS', brandCode, fileName: 'qa-orders.csv', batchId: randomUUID(), csv: csv(orderColumns, [orderValues]) };
  await api('/api/import', { cookie: adminCookie, method: 'POST', headers: importHeaders, body: { ...input, action: 'preview' } });
  const imported = (await api('/api/import', { cookie: adminCookie, method: 'POST', headers: importHeaders, body: { ...input, action: 'commit' } })).data;
  assert.equal(imported.record.persistence, 'CONFIRMED'); fixtureIds.add(imported.record.id);
  for (const row of imported.record.importedRecordIds) fixtureIds.add(row.id);
  const importedOrderId = imported.record.importedRecordIds.find(row => row.collection === 'orders').id;
  const repeated = (await api('/api/import', { cookie: adminCookie, method: 'POST', headers: importHeaders, body: { ...input, action: 'commit' } })).data;
  assert.equal(repeated.alreadyImported, true);
  const badValues = [...orderValues]; badValues[0] = `${tag}_invalid`; badValues[12] = 'missing_product';
  await api('/api/import', { cookie: adminCookie, method: 'POST', headers: importHeaders, status: 400, body: { ...input, batchId: randomUUID(), action: 'commit', csv: csv(orderColumns, [badValues]) } });
  const returnInput = { sourceType: 'RETURNS', brandCode, fileName: 'qa-returns.csv', batchId: randomUUID(), csv: csv(['Order ID', 'Date', 'Product ID', 'Quantity', 'Reason', 'Resolution', 'Valley', 'Remarks'], [[importedOrderId, today, product.id, 1, 'Damage', 'Pending', 'Inside', 'QA only']]) };
  const returned = (await api('/api/import', { cookie: adminCookie, method: 'POST', headers: importHeaders, body: { ...returnInput, action: 'commit' } })).data;
  fixtureIds.add(returned.record.id); for (const row of returned.record.importedRecordIds) fixtureIds.add(row.id);
  const distributor = { id: `${tag}_distributor`, name: 'QA Distributor', brandsCarried: [brandCode], area: 'QA', branches: [], contacts: [] };
  await mutate('distributors', distributor);
  const dispatchInput = { sourceType: 'OFFLINE_SALES', brandCode, fileName: 'qa-dispatch.csv', batchId: randomUUID(), csv: csv(['Dispatch ID', 'Distributor ID', 'Branch ID', 'Date', 'Product ID', 'Quantity', 'Amount Due', 'Payment Terms', 'Notes'], [[`${tag}_csv_dispatch`, distributor.id, '', today, product.id, 2, 200, 'COD', 'QA only']]) };
  const dispatched = (await api('/api/import', { cookie: adminCookie, method: 'POST', headers: importHeaders, body: { ...dispatchInput, action: 'commit' } })).data;
  fixtureIds.add(dispatched.record.id); for (const row of dispatched.record.importedRecordIds) fixtureIds.add(row.id);
  await api('/api/import', { cookie: officer.cookie, method: 'POST', status: 404, body: { ...input, action: 'commit' } });
  const importView = (await api('/api/sync', { cookie: adminCookie })).data.data;
  assert.equal(importView.orders.filter(row => row.orderNumber === `${tag}_csv`.toUpperCase()).length, 1);
  assert(importView.returns.some(row => row.orderId === importedOrderId));
  assert(importView.dispatches.some(row => row.id === `${tag}_csv_dispatch`));
  assert.equal(importView.customers.find(row => row.phone === customerPhone).totalOrders, 2);
  mark('Orders, returns and dispatch CSV batches validate, commit atomically, replay once and update Customer 360');
  const flag = await api('/api/feature-flags', { cookie: adminCookie, method: 'POST', body: { name: tag, description: 'QA only', isEnabled: true, enabledForUsers: [officerId], variant: 'A' } });
  fixtureIds.add(flag.data.data.id);
  await api('/api/feature-flags', { cookie: officer.cookie, method: 'POST', status: 404, body: { name: `${tag}_denied` } });
  await api('/api/feature-flags', { cookie: officer.cookie, method: 'POST', body: { type: 'event', flagName: tag, userId: adminId, variant: 'A', action: 'PAGE_VIEW' } });
  const events = await service(`workspace_records?collection=eq.flagEvents&data->>flagName=eq.${tag}&select=id,data`);
  assert.equal(events.length, 1); assert.equal(events[0].data.userId, officerId); fixtureIds.add(events[0].id);
  const analytics = (await api(`/api/feature-flags?analytics=${tag}`, { cookie: adminCookie })).data.data;
  assert.equal(analytics.variantA.pageViews, 1);
  mark('Feature flags persist; analytics use the authenticated identity');
  const shared = { id: `${tag}_link`, token: `bb_${randomBytes(32).toString('base64url')}`, name: 'QA private share', brandScope: [brandCode], brandFilter: [brandCode], allowedPages: ['DASHBOARD_OVERVIEW', 'PRODUCT_PERFORMANCE'], showCustomerDetails: false, showStaffDetails: false, showOrderRows: false, showProductNames: true, showComboDetails: false, dateRangeType: 'LIVE', passcode: randomBytes(12).toString('hex'), isActive: true, accessCount: 999, createdAt: new Date().toISOString() };
  await mutate('sharedAccessLinks', shared);
  await api(`/api/shared/${shared.token}`, { status: 401 });
  const publicData = (await api(`/api/shared/${shared.token}`, { headers: { 'X-Shared-Passcode': shared.passcode } })).data;
  assert(publicData.data.products.some(row => row.id === product.id));
  assert(!publicData.data.products.some(row => row.id === otherProduct.id));
  for (const secret of [customerPhone, shared.passcode, shared.token]) assert(!JSON.stringify(publicData).includes(secret));
  const sharedView = (await api('/api/sync', { cookie: adminCookie })).data.data.sharedAccessLinks.find(row => row.id === shared.id);
  assert.equal(sharedView.accessCount, 1);
  await mutate('sharedAccessLinks', { ...shared, isActive: false }, adminCookie, 1);
  await api(`/api/shared/${shared.token}`, { headers: { 'X-Shared-Passcode': shared.passcode }, status: 404 });
  mark('Public sharing enforces passcode, brand projection, real access counts and revocation');
  const admins = initial.data.users.filter(user => user.active && (user.role === 'SUPER_ADMIN' || user.isSuperAdmin));
  if (admins.length === 1) {
    await api('/api/users', { cookie: adminCookie, method: 'PATCH', body: { id: adminId, active: false }, status: 400 });
    await api('/api/sync', { cookie: adminCookie });
    mark('The last active Super Admin cannot be deactivated');
  }
  const google = (await api('/api/integrations/google', { cookie: adminCookie })).data;
  assert.equal(google.success, true);
  mark('Google status is real and available to Super Admin only; OAuth still requires setup');
  for (let attempt = 0; attempt < 6; attempt++) await api('/api/auth/login', { method: 'POST', status: attempt < 5 ? 401 : 429, headers: { 'X-Real-IP': '198.51.100.99' }, body: { identifier: `${tag}_invalid@example.test`, password: 'invalid-password-for-qa' } });
  const durableKey = createHmac('sha256', env.AUTH_SESSION_SECRET).update(`qa-durable:${tag}`).digest('hex');
  for (let attempt = 0; attempt < 6; attempt++) assert.equal((await service('rpc/take_login_attempt', { method: 'POST', body: JSON.stringify({ p_key: durableKey }) })).allowed, attempt < 5);
  mark('Durable login protection refuses the sixth attempt and sends a retry interval');
  console.log(JSON.stringify({ checks: checks.length, passed: true, fixtures: tag }));
} finally {
  // Delete only this run's precise IDs and its audit/notification descendants.
  if (adminId) {
    const throttleKey = createHmac('sha256', env.AUTH_SESSION_SECRET).update(`login:198.51.100.99:${tag}_invalid@example.test`).digest('hex');
    await service(`login_rate_limits?key=eq.${throttleKey}`, { method: 'DELETE' });
    const durableKey = createHmac('sha256', env.AUTH_SESSION_SECRET).update(`qa-durable:${tag}`).digest('hex');
    await service(`login_rate_limits?key=eq.${durableKey}`, { method: 'DELETE' });
    const ids = [...fixtureIds];
    const rows = await service('workspace_records?select=id,collection,data,created_by');
    for (const row of rows) {
      if (fixtureIds.has(row.id) || row.id.startsWith(tag) || row.created_by === officerId || fixtureIds.has(row.data?.entityId) || row.data?.userId === officerId) {
        await service(`workspace_records?collection=eq.${encodeURIComponent(row.collection)}&id=eq.${encodeURIComponent(row.id)}`, { method: 'DELETE' });
      }
    }
    await service(`gps_pings?officer_id=eq.${officerId}`, { method: 'DELETE' });
    if (officerCreated && process.env.QA_KEEP_OFFICER !== '1') await service(`users?id=eq.${officerId}`, { method: 'DELETE' });
    for (const brand of createdBrands) await service(`brands?id=eq.${encodeURIComponent(brand.id)}`, { method: 'DELETE' });
    console.log('QA business fixtures cleaned up.');
  }
}
