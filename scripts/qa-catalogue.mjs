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
let brand, officerId, admin;
let passed = 0;
const mark = text => { passed++; console.log(`PASS ${text}`); };
async function api(path, { method = 'GET', body, cookie = admin?.cookie, user = admin?.user.id, status = 200, origin = base } = {}) {
  const response = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(user ? { 'X-Workspace-User': user } : {}), ...(method !== 'GET' ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
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
  assert.equal((await inspect(product.id)).data.canDelete, false);
  await remove(product.id, 1, 409);
  await api(`/api/products/${product.id}`, { method: 'PATCH', body: { expectedVersion: 1, active: false } });
  assert.equal((await inspect(product.id)).data.product.active, false);
  const order = { id: `${tag}_order`, orderNumber: `${tag}_ORDER`, brandCode: brand.code, customerName: 'QA customer', customerPhone: '9800000000', status: 'PENDING', items: [{ productId: product.id, productName: product.name, brandCode: brand.code, quantity: 1, unitPrice: 100, totalPrice: 100 }] };
  await mutation('orders', order, 0, 400);
  await api(`/api/products/${product.id}`, { method: 'PATCH', body: { expectedVersion: 2, active: true } });
  mark('Linked deletion denied; archive and restore persist; new sales reject archived SKUs');

  const unused = { ...product, id: `${tag}_unused`, sku: `${tag}_UNUSED` };
  await mutation('products', unused);
  await remove(unused.id, 1);
  await api(`/api/products/${unused.id}`, { status: 404 });
  assert.equal((await service(`workspace_records?collection=eq.products&id=eq.${unused.id}&select=id`)).length, 0);
  mark('Unused product is permanently deleted from Supabase and no longer returned');

  const stocked = { ...product, id: `${tag}_stocked`, sku: `${tag}_STOCKED`, stockQty: 5 };
  await mutation('products', stocked);
  await remove(stocked.id, 1, 409);
  mark('Warehouse stock prevents permanent deletion');

  const raceProduct = { ...product, id: `${tag}_race`, sku: `${tag}_RACE` };
  await mutation('products', raceProduct);
  const countId = `${tag}_race_count`; ids.add(countId);
  const results = await Promise.all([
    fetch(`${base}/api/products/${raceProduct.id}`, { method: 'DELETE', headers: { Cookie: admin.cookie, 'X-Workspace-User': admin.user.id, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: 1 }) }),
    fetch(`${base}/api/sync`, { method: 'POST', headers: { Cookie: admin.cookie, 'X-Workspace-User': admin.user.id, Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ collection: 'stockCounts', id: countId, data: { id: countId, items: [{ productId: raceProduct.id }] }, operation: 'upsert', expectedVersion: 0, mutationId: `${tag}_race_count_save` }) }),
  ]);
  assert(results.every(response => [200, 409].includes(response.status)));
  const remaining = await service(`workspace_records?id=in.(${raceProduct.id},${countId})&select=collection,id`);
  assert(!remaining.some(row => row.id === countId) || remaining.some(row => row.id === raceProduct.id), 'Concurrent write left an orphan');
  mark('Concurrent deletion and stock write leave no dangling reference');
  console.log(JSON.stringify({ passed, base }));
} finally {
  if (admin) {
    const rows = await service('workspace_records?select=collection,id,data');
    const own = rows.filter(row => ids.has(row.id) || row.id.startsWith(tag) || ids.has(row.data?.entityId));
    for (const row of own.filter(row => row.collection !== 'products')) await service(`workspace_records?collection=eq.${row.collection}&id=eq.${encodeURIComponent(row.id)}`, { method: 'DELETE' });
    for (const row of own.filter(row => row.collection === 'products')) await service(`workspace_records?collection=eq.products&id=eq.${encodeURIComponent(row.id)}`, { method: 'DELETE' });
    if (officerId) await service(`users?id=eq.${officerId}`, { method: 'DELETE' });
    if (brand) await service(`brands?id=eq.${encodeURIComponent(brand.id)}`, { method: 'DELETE' });
    console.log('Temporary catalogue QA records removed. Existing catalogue preserved.');
  }
}
