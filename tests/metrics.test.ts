import test from 'node:test';
import assert from 'node:assert/strict';
import { prepare, type MetricData } from '../src/lib/metrics/sources.ts';
import { evaluate, recordsBehind, canSeeMetric, visibleMetrics, metricDimensions, isDated, formatValue, change, resolveMetric } from '../src/lib/metrics/engine.ts';
import { METRICS, metricByKey } from '../src/lib/metrics/catalog.ts';
import { resolveRange, compareRange, bucketsIn, bsMonthBounds } from '../src/lib/metrics/dates.ts';
import { DEFAULT_FOLLOW_UP_PLAN } from '../src/lib/follow-ups.ts';

const order = (id: string, extra: any = {}): any => ({ id, orderNumber: `FY-${id}`, brandCode: 'FORYA', orderDateAd: '2026-11-10', customerName: `C${id}`, customerPhone: '9841000001', platform: 'Instagram', paymentTerms: 'COD',
  status: 'PENDING', source: 'MANUAL', province: 'Bagmati', district: 'Kathmandu', totalAmount: 1000, createdAt: '2026-11-10T05:00:00Z', assignedToId: 'u1',
  items: [{ productId: 'p1', productName: 'Roll-on', brandCode: 'FORYA', quantity: 2, unitPrice: 500, totalPrice: 1000 }], ...extra });
const data = (extra: Partial<MetricData> = {}): MetricData => ({
  today: '2026-11-22', brands: [{ id: 'b1', code: 'FORYA', name: 'Forya' } as any, { id: 'b2', code: 'TEORA', name: 'Teora' } as any],
  users: [{ id: 'u1', fullName: 'Sita' } as any, { id: 'u2', fullName: 'Ram' } as any], products: [],
  orders: [], deliveryFailures: [], returns: [], feedback: [], customers: [], customerCalls: [], followUpPlan: { ...DEFAULT_FOLLOW_UP_PLAN, enabled: false },
  storeOrders: [], dispatches: [], cheques: [], visits: [], beatItems: [], stockCounts: [], storeCalls: [], tasks: [], marketingSends: [],
  distributors: [], branches: [], retailers: [], ...extra,
});
const nov = { fromAd: '2026-11-01', toAd: '2026-11-30' };

test('a sale is a sale everywhere: cancelled, gifts and exchange stand-ins never count', () => {
  const p = prepare(data({ orders: [order('1'), order('2', { status: 'CANCELLED' }), order('3', { exchangeReturnId: 'r1' }), order('4', { isMarketing: true }), order('5', { orderDateAd: '2026-10-01' })] }));
  assert.equal(evaluate(p, { metric: 'online_orders', range: nov }).value, 1);
  assert.equal(evaluate(p, { metric: 'online_revenue', range: nov }).value, 1000);
  assert.equal(evaluate(p, { metric: 'online_units', range: nov }).value, 2);
  assert.equal(evaluate(p, { metric: 'online_cancelled', range: nov }).value, 1);
  assert.equal(evaluate(p, { metric: 'online_cancel_rate', range: nov }).value, 50);
});

test('new and repeat come from real order history, not the typed tag', () => {
  const p = prepare(data({ orders: [order('a', { orderDateAd: '2026-10-01', orderType: 'REPEAT' }), order('b', { orderType: 'NEW' }), order('c', { customerPhone: '9800000002', orderDateAd: '2026-11-12' })] }));
  assert.equal(evaluate(p, { metric: 'online_new_customer_orders', range: nov }).value, 1, 'c is new; b is a repeat even though typed NEW');
  assert.equal(evaluate(p, { metric: 'online_repeat_share', range: nov }).value, 50);
  assert.equal(evaluate(p, { metric: 'repeat_customer_rate', range: nov }).value, 50);
  assert.equal(evaluate(p, { metric: 'days_between_orders', range: nov }).value, 40);
  const split = evaluate(p, { metric: 'online_orders', range: nov, split: 'customerType' });
  assert.deepEqual(split.groups.map((g) => [g.label, g.value]).sort(), [['New customer', 1], ['Repeat customer', 1]]);
});

test('splits, filters, time buckets and ratios stay consistent', () => {
  const p = prepare(data({ orders: [order('1'), order('2', { brandCode: 'TEORA', customerPhone: '98', platform: 'TikTok', orderDateAd: '2026-11-15', items: [{ productId: 'p2', productName: 'Ring', brandCode: 'TEORA', quantity: 2, unitPrice: 500, totalPrice: 1000 }] }), order('3', { status: 'DELIVERED', customerPhone: '97', orderDateAd: '2026-11-15' })],
    returns: [{ id: 'r', brandCode: 'FORYA', productId: 'p1', productName: 'Roll-on', quantity: 1, dateAd: '2026-11-16', platform: 'Instagram', reasonCategory: 'Damage', orderStatus: 'Returned', issueCategories: [] } as any] }));
  const byBrand = evaluate(p, { metric: 'online_orders', range: nov, split: 'brand' });
  assert.deepEqual(byBrand.groups.map((g) => [g.label, g.value]).sort(), [['Forya', 2], ['Teora', 1]]);
  assert.equal(evaluate(p, { metric: 'online_orders', range: nov, where: { channel: ['TikTok'] } }).value, 1);
  const days = evaluate(p, { metric: 'online_orders', range: { fromAd: '2026-11-10', toAd: '2026-11-16' }, bucket: 'day' });
  assert.equal(days.buckets.length, 7, 'empty days are shown as zero');
  assert.deepEqual(days.buckets.map((b) => b.value), [1, 0, 0, 0, 0, 2, 0]);
  assert.equal(evaluate(p, { metric: 'return_rate', range: nov }).value, (1 / 6) * 100);
  const rateByBrand = evaluate(p, { metric: 'return_rate', range: nov, split: 'brand' });
  assert.equal(rateByBrand.groups.find((g) => g.key === 'FORYA')!.value, 25);
  assert.equal(evaluate(p, { metric: 'delivery_success_rate', range: nov }).value, 100);
  const ignored = evaluate(p, { metric: 'online_orders', range: nov, where: { skipReason: ['x'] } });
  assert.deepEqual(ignored.ignored, ['skipReason']);
});

test('snapshot numbers ignore the date range; records behind a number match it', () => {
  const p = prepare(data({ orders: [order('1', { status: 'DISPATCHED', dispatchedDateAd: '2026-11-11' }), order('2', { status: 'DISPATCHED', orderDateAd: '2026-11-20', customerPhone: '96' })] }));
  assert.equal(evaluate(p, { metric: 'online_unconfirmed', range: { fromAd: '2026-01-01', toAd: '2026-01-02' } }).value, 1);
  assert.equal(isDated(metricByKey('online_unconfirmed')!), false);
  const behind = recordsBehind(p, { metric: 'online_orders', range: nov });
  assert.equal(behind.lines.length, 2);
  assert.match(behind.lines[0].href!, /\/orderflow\/orders\//);
  assert.equal(recordsBehind(p, { metric: 'online_orders', range: nov, split: 'brand' }, { group: 'TEORA' }).lines.length, 0);
});

test('your own numbers: formulas of two library numbers', () => {
  const p = prepare(data({ orders: [order('1'), order('2', { customerPhone: '98' })], feedback: [{ id: 'f', type: 'COMPLAINT', brandCode: 'FORYA', dateReceivedAd: '2026-11-12', issueCategories: [], fullText: '', sentiment: 'NEGATIVE' } as any] }));
  assert.equal(evaluate(p, { metric: { label: 'Complaints per order', a: 'complaints', op: 'percent', b: 'online_orders' }, range: nov }).value, 50);
  assert.equal(evaluate(p, { metric: { label: 'Orders minus complaints', a: 'online_orders', op: 'minus', b: 'complaints' }, range: nov }).value, 1);
  assert.equal(resolveMetric({ label: '', a: 'nope', op: 'divide', b: 'online_orders' }), null);
  assert.equal(evaluate(p, { metric: 'does_not_exist', range: nov }).value, null);
});

test('who sees what: page access, and money only with Money access', () => {
  const officer: any = { id: 'o', role: 'CUSTOM', customPermissions: { _v: 2, beat_plans: { access: 'FULL', scope: 'OWN', actions: ['VIEW'] }, 'p.beat_plan': { access: 'FULL', scope: 'OWN', actions: ['VIEW'] } } };
  const keys = visibleMetrics(officer).map((m) => m.key);
  assert.ok(keys.includes('store_visits') && keys.includes('store_orders'));
  assert.ok(!keys.includes('online_orders') && !keys.includes('store_order_value'), 'no online access, no money access');
  assert.equal(canSeeMetric({ id: 'a', isSuperAdmin: true } as any, metricByKey('online_revenue')!), true);
});

test('every metric in the library is complete and works on empty data', () => {
  const p = prepare(data());
  const keys = new Set<string>();
  for (const metric of METRICS) {
    assert.ok(!keys.has(metric.key), `duplicate ${metric.key}`); keys.add(metric.key);
    assert.ok(metric.label && metric.description.length > 10, metric.key);
    if ('num' in metric) assert.ok(metricByKey(metric.num) && metricByKey(metric.den), metric.key);
    assert.ok(metricDimensions(metric).length > 0, `${metric.key} has nothing to split by`);
    const result = evaluate(p, { metric: metric.key, range: nov, split: metricDimensions(metric)[0], bucket: 'week' });
    assert.ok(result.value === null || Number.isFinite(result.value), metric.key);
  }
});

test('date ranges follow the chosen calendar, and comparisons line up', () => {
  const month = resolveRange('thisMonth', 'BS', undefined, '2026-11-22');
  assert.equal(month.fromAd, bsMonthBounds('2026-11-22').fromAd);
  assert.equal(month.toAd, '2026-11-22');
  const prev = compareRange(month, 'previous', 'thisMonth', 'BS')!;
  assert.ok(prev.toAd < month.fromAd);
  assert.equal(resolveRange('last7', 'AD', undefined, '2026-11-22').fromAd, '2026-11-16');
  assert.deepEqual(compareRange({ fromAd: '2026-11-16', toAd: '2026-11-22', label: '' }, 'previous', 'last7', 'AD'), { fromAd: '2026-11-09', toAd: '2026-11-15', label: 'Period before' });
  assert.equal(compareRange({ fromAd: '2026-11-16', toAd: '2026-11-22', label: '' }, 'year', 'last7', 'AD')!.fromAd, '2025-11-16');
  assert.equal(resolveRange('thisMonth', 'AD', undefined, '2026-11-22').fromAd, '2026-11-01');
  assert.equal(bucketsIn({ fromAd: '2026-11-01', toAd: '2026-11-30' }, 'week', 'AD').length, 5);
});

test('numbers read well', () => {
  assert.equal(formatValue(1234567, 'npr', { compact: true }), 'NPR 12.3L');
  assert.equal(formatValue(12.345, 'pct'), '12%');
  assert.equal(formatValue(null, 'count'), '—');
  assert.deepEqual(change(110, 100, 'count', 'up'), { text: '+10%', tone: 'good' });
  assert.deepEqual(change(5, 3, 'pct', 'down'), { text: '+2.0 pts', tone: 'bad' });
});
