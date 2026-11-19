import test from 'node:test';
import assert from 'node:assert/strict';
import { productMetrics, productMonthlyTrend } from '../src/lib/product-metrics.ts';
import { belongsToStore, orderCadenceDays, shelfForecast } from '../src/lib/store-records.ts';
import { compareWindows, changeLabel, inWindow } from '../src/lib/period-compare.ts';
import type { Combo, FeedbackEntry, Order, ReturnEntry, SecondaryOrder, DeliveryFailure } from '../src/lib/types.ts';

const order = (id: string, items: { productId: string; quantity: number; isGift?: boolean }[], extra: Partial<Order> = {}): Order =>
  ({ id, status: 'DELIVERED', orderDateAd: '2026-11-10', customerPhone: '98', items, ...extra } as Order);
const store = (id: string, items: { productId: string; totalUnits: number }[], extra: Partial<SecondaryOrder> = {}): SecondaryOrder =>
  ({ id, status: 'PENDING_DISPATCH', entityType: 'RETAILER', entityId: 'r1', storeName: 'Shop', orderDateAd: '2026-11-05', items, ...extra } as SecondaryOrder);
const combo: Combo = { id: 'combo1', items: [{ productId: 'roll', quantity: 2 }, { productId: 'wash', quantity: 1 }] } as Combo;
const ret = (extra: Partial<ReturnEntry>): ReturnEntry => ({ id: Math.random().toString(), productId: 'roll', quantity: 1, orderStatus: 'Returned', dateAd: '2026-11-12', issueCategories: [], ...extra } as ReturnEntry);
const fb = (extra: Partial<FeedbackEntry>): FeedbackEntry => ({ id: Math.random().toString(), productId: 'roll', type: 'REVIEW', sentiment: 'POSITIVE', issueCategories: [], dateReceivedAd: '2026-11-12', brandCode: 'FOR', ...extra } as FeedbackEntry);

const input = {
  orders: [
    order('o1', [{ productId: 'roll', quantity: 3 }]),
    order('o2', [{ productId: 'combo1', quantity: 2 }]), // 4 roll-ons inside two combos
    order('o3', [{ productId: 'roll', quantity: 1, isGift: true }]),
    order('o4', [{ productId: 'roll', quantity: 9 }], { status: 'CANCELLED' }),
    order('o5', [{ productId: 'roll', quantity: 1 }], { exchangeReturnId: 'r9' }),
    order('o6', [{ productId: 'other', quantity: 5 }]),
  ],
  secondaryOrders: [
    store('s1', [{ productId: 'roll', totalUnits: 24 }]),
    store('s2', [{ productId: 'roll', totalUnits: 12 }], { entityType: 'BRANCH', entityId: 'b1' }),
    store('s3', [{ productId: 'roll', totalUnits: 100 }], { status: 'CANCELLED' }),
  ],
  combos: [combo],
  returns: [
    ret({}),
    ret({ orderStatus: 'Exchanged', quantity: 2 }),
    ret({ productId: 'combo1', orderStatus: 'Refunded' }), // whole combo back = 2 roll-ons
    ret({ orderStatus: 'Rejected' }),
    ret({ productId: 'other' }), // same brand, different product: must not count
  ],
  feedback: [fb({}), fb({ type: 'COMPLAINT', sentiment: 'NEGATIVE', issueCategories: ['Leak'] }), fb({ productId: 'other', type: 'COMPLAINT' }), fb({ productId: 'combo1' })],
  deliveryFailures: [{ id: 'f1', orderId: 'o1' }, { id: 'f2', orderId: 'o6' }] as DeliveryFailure[],
};

test('units include combos, leave out gifts, cancelled orders and exchanges, and split stores by type', () => {
  const m = productMetrics('roll', input);
  assert.equal(m.d2c.directUnits, 3);
  assert.equal(m.d2c.comboUnits, 4);
  assert.equal(m.d2c.units, 7);
  assert.equal(m.d2c.giftUnits, 1);
  assert.equal(m.exchangeUnitsSent, 1);
  assert.equal(m.b2b.gtUnits, 24);
  assert.equal(m.b2b.mtUnits, 12);
  assert.equal(m.totalUnits, 43);
});

test('returns, reviews and failures count only for the product itself or a combo holding it', () => {
  const m = productMetrics('roll', input);
  assert.equal(m.returns.entries.length, 4);
  assert.equal(m.returns.returnedUnits, 1);
  assert.equal(m.returns.exchangedUnits, 2);
  assert.equal(m.returns.refundedUnits, 2);
  assert.equal(m.returns.units, 5, 'rejected claims are not taken back');
  assert.equal(m.feedback.entries.length, 3);
  assert.equal(m.feedback.complaints, 1);
  assert.equal(m.feedback.topIssue, 'Leak');
  assert.deepEqual(m.failures.entries.map((f) => f.id), ['f1']);
  const other = productMetrics('other', input);
  assert.equal(other.returns.entries.length, 1);
  assert.equal(other.feedback.complaints, 1);
});

test('monthly trend groups real sales by BS or AD month', () => {
  const ad = productMonthlyTrend('roll', input, { mode: 'AD', todayAd: '2026-11-19' });
  assert.equal(ad.length, 12);
  const nov = ad.find((p) => p.key === '2026-11')!;
  assert.equal(nov.d2c, 7);
  assert.equal(nov.b2b, 36);
  assert.equal(nov.returned, 5);
  assert.ok(nov.current);
  const bs = productMonthlyTrend('roll', input, { mode: 'BS', todayAd: '2026-11-19' });
  assert.equal(bs.length, 12);
  const total = bs.reduce((sum, p) => sum + p.d2c + p.b2b, 0);
  assert.equal(total, 43);
  assert.ok(bs.every((p, i) => i === 0 || p.key > bs[i - 1].key), 'months in order');
});

test('store records match by id first, cadence is the typical gap, forecast uses real counts', () => {
  assert.ok(belongsToStore({ entityId: 'a', storeName: 'Shop' }, { id: 'a', name: 'X' }));
  assert.ok(!belongsToStore({ entityId: 'b', storeName: 'Shop' }, { id: 'a', name: 'Shop' }), 'same name, other store');
  assert.ok(belongsToStore({ storeName: ' shop ' }, { id: 'a', name: 'Shop' }), 'older record without id');
  assert.equal(orderCadenceDays(['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-29']), 7);
  assert.equal(orderCadenceDays(['2026-11-01']), null);
  const rows = shelfForecast(
    [
      { dateAd: '2026-11-01', createdAt: '', items: [{ productId: 'roll', productName: 'Roll', brandCode: 'FOR', shelfQty: 20 }] },
      { dateAd: '2026-11-11', createdAt: '', items: [{ productId: 'roll', productName: 'Roll', brandCode: 'FOR', shelfQty: 10 }, { productId: 'wash', productName: 'Wash', brandCode: 'FOR', shelfQty: 4 }] },
    ],
    [{ status: 'PENDING_DISPATCH', orderDateAd: '2026-11-05', items: [{ productId: 'roll', totalUnits: 10 }] }],
  );
  const roll = rows.find((r) => r.productId === 'roll')!;
  assert.equal(roll.perDay, 2); // 20 + 10 ordered − 10 left, over 10 days
  assert.equal(roll.daysLeft, 5);
  assert.equal(roll.status, 'LOW');
  assert.equal(rows.find((r) => r.productId === 'wash')!.status, 'UNKNOWN');
});

test('comparison windows are the last 30 days and the same 30 days a month or year earlier', () => {
  const w = compareWindows('LAST_MONTH', '2026-11-19')!;
  assert.deepEqual(w.current, { from: '2026-10-21', to: '2026-11-19' });
  assert.deepEqual(w.previous, { from: '2026-09-21', to: '2026-10-19' });
  assert.equal(compareWindows('SAME_MONTH_LAST_YEAR', '2026-11-19')!.previous.to, '2025-11-19');
  assert.equal(compareWindows('OFF', '2026-11-19'), null);
  assert.ok(inWindow('2026-11-01T10:00:00Z', w.current));
  assert.deepEqual(changeLabel(12, 10), { text: '+20%', direction: 'up' });
  assert.deepEqual(changeLabel(5, 0), { text: 'New', direction: 'up' });
});

test('combo figures: kits, buyers, linked returns, reviews and failures, share of each product', async () => {
  const { comboMetrics, comboMonthlyTrend } = await import('../src/lib/product-metrics.ts');
  const base = {
    orders: [
      order('c1', [{ productId: 'combo1', quantity: 2 }, { productId: 'other', quantity: 1 }], { customerPhone: 'A', platform: 'Instagram' } as Partial<Order>),
      order('c2', [{ productId: 'combo1', quantity: 1 }], { customerPhone: 'A', platform: 'WhatsApp' } as Partial<Order>),
      order('c3', [{ productId: 'combo1', quantity: 1 }], { customerPhone: 'B', status: 'CANCELLED' }),
      order('c4', [{ productId: 'combo1', quantity: 1, isGift: true }, { productId: 'roll', quantity: 1 }], { customerPhone: 'C' }),
      order('p1', [{ productId: 'roll', quantity: 4 }], { customerPhone: 'D' }),
    ],
    secondaryOrders: [], combos: [combo],
    returns: [
      ret({ productId: 'combo1', orderStatus: 'Exchanged' }),                  // whole kit
      ret({ productId: 'wash', comboId: 'combo1', quantity: 1 }),              // one product from a kit
      ret({ productId: 'roll', orderId: 'c1' }),                               // product from a combo order
      ret({ productId: 'roll', orderId: 'p1' }),                               // plain product order: not the combo's
    ],
    feedback: [fb({ productId: 'combo1' }), fb({ productId: 'wash', orderId: 'c2', type: 'COMPLAINT' }), fb({ productId: 'roll' })],
    deliveryFailures: [{ id: 'x', orderId: 'c2' }, { id: 'y', orderId: 'p1' }] as DeliveryFailure[],
  };
  const m = comboMetrics('combo1', base);
  assert.equal(m.kits, 3);
  assert.equal(m.giftKits, 1);
  assert.equal(m.orders.length, 2);
  assert.equal(m.buyers, 1);
  assert.equal(m.repeatBuyers, 1);
  assert.equal(m.returns.entries.length, 3);
  assert.equal(m.returns.wholeKits, 1);
  assert.deepEqual(m.returns.partUnits.map((p) => p.productId).sort(), ['roll', 'wash']);
  assert.equal(m.feedback.entries.length, 2);
  assert.equal(m.feedback.complaints, 1);
  assert.deepEqual(m.failures.entries.map((f) => f.id), ['x']);
  assert.deepEqual(m.platforms, [{ name: 'Instagram', kits: 2 }, { name: 'WhatsApp', kits: 1 }]);
  assert.deepEqual(m.boughtWith.map((b) => b.productId), ['other']);
  const roll = m.components.find((c) => c.productId === 'roll')!;
  assert.equal(roll.unitsViaCombo, 6);          // 3 kits × 2
  assert.equal(roll.productUnitsOnline, 11);   // 6 in kits + 1 + 4 on their own
  assert.equal(roll.sharePct, 55);
  const trend = comboMonthlyTrend('combo1', base, { mode: 'AD', todayAd: '2026-11-19' });
  assert.equal(trend.find((p) => p.key === '2026-11')!.d2c, 3);
  assert.equal(trend.find((p) => p.key === '2026-11')!.returned, 3);
});
