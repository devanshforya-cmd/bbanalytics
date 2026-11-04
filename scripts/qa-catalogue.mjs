import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';

// Deliberate, authenticated QA against this workspace. Only this run's fixtures are removed.
const env = Object.fromEntries((await readFile('.env.local', 'utf8')).split(/\r?\n/).filter(line => line.includes('=') && !line.trim().startsWith('#')).map(line => {
  const index = line.indexOf('='); return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, '$2')];
}));
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3001';
const tag = `qa_catalog_${Date.now()}_${randomBytes(3).toString('hex')}`;
const ids = new Set();
let brand, otherBrand, officerId, admin;
let passed = 0;
const mark = text => { passed++; console.log(`PASS ${text}`); };
const epoch = (await (await fetch(base + '/api/workspace-state')).json()).epoch;
async function api(path, { method = 'GET', body, cookie = admin?.cookie, user = admin?.user.id, status = 200, origin = base, headers = {} } = {}) {
  const response = await fetch(base + path, { method, headers: { 'X-Workspace-Epoch': epoch, ...(cookie ? { Cookie: cookie } : {}), ...(user ? { 'X-Workspace-User': user } : {}), ...(method !== 'GET' ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${response.status} ${data.error || ''}`);
  return { data, response };
}
async function service(path, options = {}) {
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' } });
  assert(response.ok, `Fixture storage/cleanup failed: ${response.status}`);
  const text = await response.text(); return text ? JSON.parse(text) : null;
}
async function mutation(collection, record, version = 0, status = 200) {
  ids.add(record.id);
  return (await api('/api/sync', { method: 'POST', status, body: { collection, id: record.id, data: record, expectedVersion: version, operation: 'upsert', mutationId: `${tag}_${randomUUID()}` } })).data;
}
const inspect = id => api(`/api/products/${id}`);
const remove = (id, expectedVersion, status = 200, extra = {}) => api(`/api/products/${id}`, { method: 'DELETE', body: { expectedVersion }, status, ...extra });
try {
  const login = await api('/api/auth/login', { method: 'POST', body: { identifier: 'admin@brandbucket.com', password: env.INITIAL_ADMIN_PASSWORD }, cookie: null, user: null });
  admin = { cookie: login.response.headers.get('set-cookie').split(';')[0], user: login.data.user };
  brand = (await api('/api/brands', { method: 'POST', status: 201, body: { code: tag.toUpperCase(), name: 'QA temporary catalogue brand' } })).data.data;
  const product = { id: `${tag}_product`, brandCode: brand.code, brandId: brand.id, sku: `${tag}_SKU`, name: 'QA temporary catalogue item', category: 'QA', mrp: 100, unitPrice: 100, thresholdQty: 1, keywords: [], active: true };
  await mutation('products', product);
  assert.equal((await inspect(product.id)).data.canDelete, true);
  await remove(product.id, 1, 409, { user: 'another-user' });
  await remove(product.id, 1, 403, { origin: 'https://other.example' });
  await remove(product.id, 99, 409);
  mark('Current product, account binding, cross-origin denial and version conflict');

  officerId = `${tag}_officer`;
  const password = randomBytes(24).toString('base64url');
  await api('/api/users', { method: 'POST', status: 201, body: { id: officerId, fullName: 'QA Catalogue Officer', email: `${tag}@example.test`, phone: `98${String(Date.now()).slice(-8)}`, role: 'SALES_OFFICER', active: true, password, assignedBrands: [brand.code], customPermissions: { products: { access: 'FULL', scope: 'ALL', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] } } } });
  const staff = await api('/api/auth/login', { method: 'POST', body: { identifier: `${tag}@example.test`, password }, cookie: null, user: null });
  const cookie = staff.response.headers.get('set-cookie').split(';')[0];
  await remove(product.id, 1, 403, { cookie, user: officerId });
  await api('/api/sync', { method: 'POST', cookie, user: officerId, status: 403, body: { collection: 'products', id: product.id, expectedVersion: 1, operation: 'delete', mutationId: `${tag}_staff_denied` } });
  mark('Staff cannot delete products through either endpoint despite a DELETE grant');

  const combo = { id: `${tag}_combo`, brandCode: brand.code, componentProductIds: [product.id], items: [{ productId: product.id, quantity: 1 }] };
  await mutation('combos', combo);
  assert.equal((await inspect(product.id)).data.canDelete, true);
  await api(`/api/products/${product.id}`, { method: 'PATCH', body: { expectedVersion: 1, active: false } });
  assert.equal((await inspect(product.id)).data.product.active, false);
  const options = (await api('/api/sync')).data.data.workspaceConfig.find(row => row.id === 'workspace')?.orderOptions;
  const platform = options?.channels.find(row => row.active)?.name || 'Instagram';
  const deliveryMethod = options?.deliveryMethods.find(row => row.active)?.name || 'Standard';
  const order = { platform, deliveryMethod, id: `${tag}_order`, orderNumber: `${tag}_ORDER`, brandCode: brand.code, customerName: 'QA customer', customerPhone: '9800000000', status: 'PENDING', items: [{ productId: product.id, productName: product.name, brandCode: brand.code, quantity: 1, unitPrice: 100, totalPrice: 100 }] };
  assert.match((await mutation('orders', order, 0, 400)).error, /active product/i);
  await api(`/api/products/${product.id}`, { method: 'PATCH', body: { expectedVersion: 2, active: true } });
  mark('Archive and restore persist; new sales reject archived SKUs');
  await mutation('orders', order);
  const originalOrder = (await service(`workspace_records?collection=eq.orders&id=eq.${order.id}&select=data`))[0].data;
  await remove(product.id, 3);
  await api(`/api/products/${product.id}`, { status: 404 });
  await api(`/api/products/${product.id}`, { method: 'PATCH', status: 404, body: { expectedVersion: 3, active: true } });
  assert.deepEqual((await service(`workspace_records?collection=eq.orders&id=eq.${order.id}&select=data`))[0].data, originalOrder);
  const historical = await service(`workspace_records?collection=eq.deletedProducts&id=eq.${product.id}&select=data`);
  assert.equal(historical[0].data.name, product.name);
  assert.equal(JSON.parse(historical[0].data.snapshotJson).sku, product.sku);
  const refreshed = (await api('/api/sync')).data;
  const workspace = refreshed.data;
  assert(refreshed.deletedProductIds.includes(product.id));
  assert(!workspace.products.some(row => row.id === product.id));
  assert.equal(workspace.deletedProducts, undefined);
  await mutation('products', product, 0, 409);
  assert.match((await mutation('orders', { ...order, id: `${tag}_deleted_sale`, orderNumber: `${tag}_DELETED` }, 0, 400)).error, /active product/i);
  await api('/api/sync', { method: 'POST', status: 400, body: { collection: 'deletedProducts', id: product.id, operation: 'delete', expectedVersion: 1, mutationId: `${tag}_history_denied` } });

  otherBrand = (await api('/api/brands', { method: 'POST', status: 201, body: { code: `${tag}_OTHER`.toUpperCase(), name: 'QA foreign catalogue brand' } })).data.data;
  const foreign = { ...product, id: `${tag}_foreign_product`, sku: `${tag}_FOREIGN`, brandCode: otherBrand.code, brandId: otherBrand.id };
  await mutation('products', foreign);
  await remove(foreign.id, 1);
  const officerView = (await api('/api/sync', { cookie, user: officerId })).data;
  assert(officerView.deletedProductIds.includes(product.id));
  assert(!officerView.deletedProductIds.includes(foreign.id), 'Deletion IDs leaked another brand');
  mark('Linked deletion removes catalogue row, preserves exact order history, hides internal snapshot, rejects restoration/reuse and new sales');

  const unused = { ...product, id: `${tag}_unused`, sku: `${tag}_UNUSED` };
  await mutation('products', unused);
  await remove(unused.id, 1);
  await api(`/api/products/${unused.id}`, { status: 404 });
  assert.equal((await service(`workspace_records?collection=eq.products&id=eq.${unused.id}&select=id`)).length, 0);
  mark('Unused product disappears from the catalogue and lookup');

  const stocked = { ...product, id: `${tag}_stocked`, sku: `${tag}_STOCKED`, stockQty: 5 };
  await mutation('products', stocked);
  await remove(stocked.id, 1);
  const stockHistory = await service(`workspace_records?collection=eq.deletedProducts&id=eq.${stocked.id}&select=data`);
  assert.equal(stockHistory[0].data.stockQty, 5);
  mark('Deletion with recorded warehouse stock preserves its quantity in private history');

  const raceProduct = { ...product, id: `${tag}_race`, sku: `${tag}_RACE` };
  await mutation('products', raceProduct);
  const countId = `${tag}_race_sale`; ids.add(countId);
  const raceOrder = { ...order, id: countId, orderNumber: `${tag}_RACE`, items: [{ ...order.items[0], productId: raceProduct.id }] };
  const results = await Promise.all([
    fetch(`${base}/api/products/${raceProduct.id}`, { method: 'DELETE', headers: { 'X-Workspace-Epoch': epoch, Cookie: admin.cookie, 'X-Workspace-User': admin.user.id, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: 1 }) }),
    fetch(`${base}/api/sync`, { method: 'POST', headers: { 'X-Workspace-Epoch': epoch, Cookie: admin.cookie, 'X-Workspace-User': admin.user.id, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ collection: 'orders', id: countId, data: raceOrder, operation: 'upsert', expectedVersion: 0, mutationId: `${tag}_race_count_save` }) }),
  ]);
  assert.equal(results[0].status, 200);
  assert([200, 400, 409].includes(results[1].status));
  const remaining = await service(`workspace_records?id=in.(${raceProduct.id},${countId})&select=collection,id`);
  assert(!remaining.some(row => row.collection === 'products'));
  assert(remaining.some(row => row.collection === 'deletedProducts' && row.id === raceProduct.id), 'Missing historical product snapshot');
  mark('Concurrent deletion and sale preserve historical identity without restoring the catalogue product');
  const distributor = { id: `${tag}_dist`, name: 'QA distributor', city: 'QA', brandsRepresented: [brand.code] };
  const branch = { id: `${tag}_branch`, name: 'QA branch', distributorId: distributor.id, brandsAvailable: [brand.code] };
  const retailer = { id: `${tag}_retailer`, name: 'QA retailer', branchId: branch.id, distributorId: distributor.id, brandsStocked: [brand.code], assignedOfficerId: admin.user.id };
  await mutation('distributors', distributor); await mutation('branches', branch); await mutation('retailers', retailer);
  const inspectStore = async id => (await api(`/api/stores/${id}`)).data;
  const deleteStore = async (store, status = 200, extra = {}) => api(`/api/stores/${store.id}`, { method: 'DELETE', status, body: { collection: store.collection, expectedVersion: store.version }, ...extra });
  const d = { ...await inspectStore(distributor.id), id: distributor.id };
  assert.equal(d.children.length, 2); await deleteStore(d, 409);
  const r = { ...await inspectStore(retailer.id), id: retailer.id };
  await deleteStore(r, 403, { cookie, user: officerId });
  await deleteStore(r, 403, { origin: 'https://other.example' });
  await deleteStore({ ...r, version: 999 }, 409);
  mark('Store deletion enforces Super Admin, account origin, version and linked-child checks');
  const beat = { id: `${tag}_store_beat`, storeId: retailer.id, storeName: retailer.name, officerId: admin.user.id, status: 'PENDING' };
  const schedule = { id: `${tag}_store_schedule`, storeId: retailer.id, officerId: admin.user.id };
  const visit = { id: `${tag}_store_visit`, storeId: retailer.id, officerId: admin.user.id, status: 'COMPLETED' };
  await mutation('beatItems', beat); await mutation('recurringSchedules', schedule); await mutation('visits', visit);
  const preview = await inspectStore(retailer.id); assert.equal(preview.pendingCount, 2);
  await deleteStore(r);
  await api(`/api/stores/${retailer.id}`, { status: 404 });
  await mutation('retailers', retailer, 0, 409);
  const snapshot = (await api('/api/sync')).data;
  assert(snapshot.deletedStoreIds.includes(retailer.id));
  assert(!snapshot.data.beatItems.some(row => row.id === beat.id));
  assert(!snapshot.data.recurringSchedules.some(row => row.id === schedule.id));
  assert(snapshot.data.visits.some(row => row.id === visit.id));
  await deleteStore({ ...await inspectStore(branch.id), id: branch.id });
  await deleteStore({ ...await inspectStore(distributor.id), id: distributor.id });
  mark('Retailer, branch and distributor delete permanently; routes cancel, history remains and stale IDs cannot return');
  await api('/api/sync', { method: 'POST', status: 409, headers: { 'X-Workspace-Epoch': 'before-reset' }, body: { collection: 'retailers', id: retailer.id, data: retailer, operation: 'upsert', expectedVersion: 0, mutationId: `${tag}_stale_reset` } });
  mark('A browser from an earlier dataset cannot upload cached records');
  console.log(JSON.stringify({ passed, base }));
} finally {
  if (admin) {
    const rows = await service('workspace_records?select=collection,id,data');
    const own = rows.filter(row => ids.has(row.id) || row.id.startsWith(tag) || ids.has(row.data?.entityId));
    for (const row of own.filter(row => row.collection !== 'products')) await service(`workspace_records?collection=eq.${row.collection}&id=eq.${encodeURIComponent(row.id)}`, { method: 'DELETE' });
    for (const row of own.filter(row => row.collection === 'products')) await service(`workspace_records?collection=eq.products&id=eq.${encodeURIComponent(row.id)}`, { method: 'DELETE' });
    if (officerId) await service(`users?id=eq.${officerId}`, { method: 'DELETE' });
    if (brand) await service(`brands?id=eq.${encodeURIComponent(brand.id)}`, { method: 'DELETE' });
    if (otherBrand) await service(`brands?id=eq.${encodeURIComponent(otherBrand.id)}`, { method: 'DELETE' });
    console.log('Temporary catalogue QA records removed. Existing catalogue preserved.');
  }
}
