import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCountItems, checkCount, countSheet, storeStockStatus } from '../src/lib/stock-count-sheet.ts';

const products = [
  { id: 'a', name: 'Forya Underarm Deodorant Roll On - Aqua', alias: 'Aqua roll-on', brandCode: 'FORYA', subBrandId: 'sb_forya_body', active: true },
  { id: 'b', name: 'Forya Hair Growth Serum', brandCode: 'FORYA', active: true },
  { id: 'c', name: 'Never ordered here', brandCode: 'FORYA', active: true },
  { id: 'd', name: 'Archived but ordered', brandCode: 'FORYA', active: false },
] as any[];
const order = (date: string, items: [string, number][], status = 'DELIVERED') => ({ entityId: 's1', status, orderDateAd: date, items: items.map(([productId, totalUnits]) => ({ productId, totalUnits })) }) as any;
const count = (date: string, items: [string, number][]) => ({ entityId: 's1', dateAd: date, createdAt: date, items: items.map(([productId, shelfQty]) => ({ productId, shelfQty, productName: productId, brandCode: 'FORYA' })) }) as any;

test('lists only what the store carries, with short names, last count, orders since and expected stock', () => {
  const { rows, others } = countSheet({
    storeId: 's1', products, todayAd: '2026-11-20',
    secondaryOrders: [order('2026-10-25', [['a', 30], ['d', 6]]), order('2026-11-05', [['a', 10]]), order('2026-11-12', [['a', 12], ['b', 6]]), order('2026-11-13', [['b', 50]], 'CANCELLED'), { ...order('2026-11-01', [['c', 9]]), entityId: 'other' }],
    stockCounts: [count('2026-11-01', [['a', 20]]), count('2026-11-11', [['a', 10]])],
  });
  assert.deepEqual(rows.map((r) => r.productId), ['a', 'b'], 'carried products only, archived and other stores left out, most ordered first');
  assert.equal(rows[0].label, 'Aqua roll-on');
  assert.equal(rows[0].lastQty, 10);
  assert.equal(rows[0].lastDateAd, '2026-11-11');
  assert.equal(rows[0].deliveredSince, 12);
  assert.equal(rows[0].perDay, 2, '(20 + 10 ordered − 10) / 10 days');
  assert.equal(rows[0].expected, 4, '10 + 12 − 2 × 9 days');
  assert.equal(rows[1].lastQty, null);
  assert.equal(rows[1].expected, null);
  assert.ok(others.some((p) => p.id === 'c') && !others.some((p) => p.id === 'd'));
});

test('sense checks, and saving keeps previous counts and leaves uncounted rows out', () => {
  const row = { lastQty: 10, deliveredSince: 12, expected: 14 };
  assert.equal(checkCount(row, 0), 'OUT');
  assert.equal(checkCount(row, 30), 'MORE_THAN_POSSIBLE');
  assert.equal(checkCount(row, 5), 'MUCH_LOWER');
  assert.equal(checkCount(row, 12), 'OK');
  const rows = [
    { productId: 'a', fullName: 'Full A', label: 'A', brandCode: 'FORYA', subBrandId: 'sb_x', lastQty: 10, lastDateAd: '2026-11-11', deliveredSince: 0, perDay: null, expected: null },
    { productId: 'b', fullName: 'Full B', label: 'B', brandCode: 'FORYA', lastQty: null, lastDateAd: null, deliveredSince: 0, perDay: null, expected: null },
  ];
  const items = buildCountItems(rows as any, { a: 4, b: null });
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], { productId: 'a', productName: 'Full A', brandCode: 'FORYA', subBrandId: 'sb_x', shelfQty: 4, previousQty: 10, flaggedDrop: true });
});

test('store status: last count, out of stock and running low', () => {
  const status = storeStockStatus('s1', [count('2026-11-01', [['a', 20], ['b', 5]]), count('2026-11-11', [['a', 10], ['b', 0]])], [order('2026-11-05', [['a', 10]])], '2026-11-20');
  assert.equal(status.lastCountAd, '2026-11-11');
  assert.equal(status.daysSinceCount, 9);
  assert.equal(status.outOfStock, 1);
  assert.equal(status.runningLow, 1, 'a: 10 left at 2 a day = 5 days');
  assert.equal(storeStockStatus('none', [], [], '2026-11-20').daysSinceCount, null);
});
