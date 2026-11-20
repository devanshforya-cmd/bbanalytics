import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSampleData, SAMPLE_ID_PREFIX, SAMPLE_USER_PREFIX } from '../src/lib/sample-data/generate.ts';
import { productMetrics } from '../src/lib/product-metrics.ts';
import { shelfForecast, orderCadenceDays } from '../src/lib/store-records.ts';

const products = [
  { id: 'p1', name: 'Forya Roll On', brandCode: 'FORYA', mrp: 399, caseSize: 72, active: true },
  { id: 'p2', name: 'Forya Acne Control Body Wash', brandCode: 'FORYA', mrp: 719, caseSize: 72, active: true },
  { id: 'p3', name: 'Forya Hair Growth Serum', brandCode: 'FORYA', mrp: 1119, caseSize: 72, active: true },
] as any[];
const set = generateSampleData({ todayAd: '2026-11-20', products, manager: { id: 'user_admin', name: 'Admin' } });
const of = (collection: string) => set.records.filter((r) => r.collection === collection).map((r) => r.data as any);

test('every test record is tagged and removable', () => {
  assert.ok(set.records.length > 1000);
  for (const record of set.records) {
    assert.equal(record.data.isSample, true, record.id);
    assert.ok(record.id.startsWith(SAMPLE_ID_PREFIX), record.id);
    assert.equal(record.data.id, record.id);
  }
  assert.ok(set.users.every((user) => user.id.startsWith(SAMPLE_USER_PREFIX) && user.email.endsWith('.invalid')));
  const keys = set.records.map((r) => `${r.collection}/${r.id}`);
  assert.equal(new Set(keys).size, keys.length, 'no duplicate ids');
});

test('never creates online orders or customers, and no offer campaign is live', () => {
  assert.equal(of('orders').length, 0);
  assert.equal(of('customers').length, 0);
  assert.ok(of('campaigns').every((c) => c.status === 'DRAFT' || c.status === 'ENDED'));
});

test('links between records resolve', () => {
  const stores = new Set([...of('retailers'), ...of('branches')].map((s) => s.id));
  const officers = new Set(set.users.map((u) => u.id));
  const productIds = new Set(products.map((p) => p.id));
  for (const collection of ['visits', 'secondaryOrders', 'stockCounts', 'cheques', 'callLogs', 'shelfPhotos', 'documents', 'beatItems']) {
    for (const row of of(collection)) {
      assert.ok(stores.has(row.entityId), `${collection} ${row.id} store`);
      assert.ok(officers.has(row.officerId), `${collection} ${row.id} officer`);
    }
  }
  for (const order of of('secondaryOrders')) for (const line of order.items) assert.ok(productIds.has(line.productId));
  const distributors = new Set(of('distributors').map((d) => d.id));
  for (const branch of of('branches')) assert.ok(distributors.has(branch.distributorId));
  const numbers = of('secondaryOrders').map((o) => o.orderNumber);
  assert.equal(new Set(numbers).size, numbers.length);
  assert.ok(numbers.every((n) => /^SO-9\d{3}$/.test(n)));
});

test('the history is coherent enough for the real calculations', () => {
  const metrics = productMetrics('p1', { orders: [], secondaryOrders: of('secondaryOrders'), combos: [], returns: [], feedback: [] });
  assert.ok(metrics.b2b.gtUnits > 0 && metrics.b2b.mtUnits > 0);
  const store = of('retailers').find((r) => r.name === 'Sagun Cosmetics Centre');
  const orders = of('secondaryOrders').filter((o) => o.entityId === store.id);
  assert.ok(orderCadenceDays(orders.map((o) => o.orderDateAd))! <= 14);
  const forecast = shelfForecast(of('stockCounts').filter((c) => c.entityId === store.id), orders);
  assert.ok(forecast.some((row) => row.perDay !== null && row.perDay > 0));
  assert.ok(of('beatItems').some((b) => b.dateAd === '2026-11-20'), 'a beat plan for today');
  assert.ok(of('retailers').some((r) => r.isCreditLocked) && of('retailers').some((r) => r.lastVisitDaysAgo > 40), 'some problem stores to act on');
});
