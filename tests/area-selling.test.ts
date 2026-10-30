import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStoreArea, applicableStorePromotions, normalizeArea } from '../src/lib/area-selling.ts';
import { validateWorkspaceMutation } from '../src/lib/db/server-workspace.ts';
import type { Product, Promotion, Retailer, SecondaryOrder, StockCount } from '../src/lib/types.ts';

const now = new Date('2026-10-29T12:00:00Z');
const store = (id: string, overrides: Partial<Retailer> = {}): Retailer => ({ id, name: id, city: 'Kathmandu', area: 'New Baneshwor', ...overrides } as Retailer);
const product = (id = 'p1', overrides: Partial<Product> = {}): Product => ({ id, name: id, active: true, brandCode: 'FOR', ...overrides } as Product);
const order = (id: string, entityId: string, date = '2026-10-20', units = 10, overrides: Partial<SecondaryOrder> = {}): SecondaryOrder => ({
  id, entityId, entityType: 'RETAILER', orderDateAd: date, status: 'DELIVERED',
  items: [{ productId: 'p1', totalUnits: units }], ...overrides,
} as SecondaryOrder);
const stores = [store('target'), store('peer1'), store('peer2')];
const recent = [order('o1', 'peer1'), order('o2', 'peer2'), order('o3', 'peer2')];
const analyze = (orders: SecondaryOrder[], counts: StockCount[] = []) => analyzeStoreArea('target', stores, orders, [product()], counts, now);
const count = (quantity: number, dateAd = '2026-10-28'): StockCount => ({ id: 'count', entityId: 'target', entityType: 'RETAILER', dateAd, items: [{ productId: 'p1', shelfQty: quantity }] } as StockCount);

test('matches city and area normalization, uses equal recent/prior windows, and explains evidence', () => {
  assert.equal(normalizeArea('  New-Baneshwor  '), 'new baneshwor');
  const result = analyzeStoreArea('target', [stores[0], store('peer1', { city: ' KATHMANDU ', area: 'new-baneshwor' }), stores[2]], [...recent, order('prior', 'peer1', '2026-09-15', 10)], [product()], [], now);
  assert.equal(result.status, 'READY');
  assert.equal(result.trends[0].recentUnits, 30);
  assert.equal(result.trends[0].previousUnits, 10);
  assert.equal(result.trends[0].growthPct, 200);
  assert.equal(result.confidence, 'LOW');
  assert.equal(result.opportunities[0].kind, 'INTRODUCE');
  assert.equal(result.opportunities[0].score, 100);
  assert.equal(result.opportunityScore, 100);
  assert.match(result.opportunities[0].reason, /30 delivered units across 2 other stores/);
  assert.match(result.opportunities[0].reason, /Confirm the shelf/);
});

test('does not inflate demand from duplicate, pending, cancelled, dispatched, future, invalid or unknown-store records', () => {
  const result = analyze([
    ...recent, recent[0], order('pending', 'peer1', undefined, 1000, { status: 'PENDING_DISPATCH' }),
    order('cancelled', 'peer1', undefined, 1000, { status: 'CANCELLED' }),
    order('dispatched', 'peer1', undefined, 1000, { status: 'DISPATCHED' }),
    order('future', 'peer1', '2026-11-01', 1000), order('invalid', 'peer1', 'bad-date', 1000),
    order('old', 'peer1', '2026-08-01', 1000), order('unknown', 'hidden-store', undefined, 1000),
    order('bad-units', 'peer1', undefined, -5), order('nan-units', 'peer1', undefined, Number.NaN),
    order('bad-lines', 'peer1', undefined, 1, { items: [null] as unknown as SecondaryOrder['items'] }),
    order('missing-lines', 'peer1', undefined, 1, { items: undefined as unknown as SecondaryOrder['items'] }),
  ]);
  assert.equal(result.recentOrderCount, 3);
  assert.equal(result.trends[0].recentUnits, 30);
  assert.equal(result.trends[0].growthPct, null);
  assert.equal(result.opportunityScore, 80, 'No previous-period demand must not earn growth points');
});

test('areas with the same name in another city and unpermitted stores cannot contribute', () => {
  const result = analyzeStoreArea('target', [store('target'), store('peer1', { city: 'Pokhara' }), store('peer2')], recent, [product()], [], now);
  assert.equal(result.status, 'INSUFFICIENT_DATA');
  assert.equal(result.recentStoreCount, 1);
  assert.equal(result.opportunityScore, null);
  assert.deepEqual(result.trends, []);
  assert.deepEqual(analyzeStoreArea('unknown', stores, recent, [product()], [], now).opportunities, []);
});

test('requires a meaningful region sample and two other buying stores for an individual pitch', () => {
  assert.equal(analyze(recent.slice(0, 2)).status, 'INSUFFICIENT_DATA');
  const result = analyze([order('t', 'target'), order('p1', 'peer1'), order('p2', 'peer1')]);
  assert.equal(result.status, 'READY');
  assert.equal(result.opportunityScore, 0);
  assert.deepEqual(result.opportunities, []);
  assert.equal(analyzeStoreArea('target', [store('target', { area: '' }), ...stores.slice(1)], recent, [product()], [], now).status, 'INSUFFICIENT_DATA');
});

test('fresh shelf evidence suppresses unsupported product gaps and distinguishes a zero-count restock prompt', () => {
  assert.deepEqual(analyze(recent, [count(8)]).opportunities, []);
  const zero = analyze(recent, [count(0)]);
  assert.equal(zero.opportunities[0].kind, 'REVIEW_REORDER');
  assert.match(zero.opportunities[0].reason, /shelf count in the last seven days recorded zero/);
  assert.equal(analyze(recent, [count(8, '2026-10-01')]).opportunities[0].kind, 'INTRODUCE', 'Stale counts cannot prove current stock');
  assert.deepEqual(analyze(recent, [
    { ...count(0), createdAt: '2026-10-28T08:00:00Z' },
    { ...count(8), createdAt: '2026-10-28T12:00:00Z' },
  ]).opportunities, [], 'A newer count on the same day must supersede an older zero count');
});

test('purchase history changes a pitch to a replenishment review without inventing stock or quantities', () => {
  const result = analyze([...recent, order('prior-target', 'target', '2026-09-20', 12)]);
  assert.equal(result.opportunities[0].kind, 'REVIEW_REORDER');
  assert.match(result.opportunities[0].reason, /bought it in the previous 30 days/);
  assert.deepEqual(analyze([...recent, order('recent-target', 'target')]).opportunities, []);
  assert.equal('suggestedQty' in result.opportunities[0], false);
});

test('inactive and unavailable catalog products never become pitches; evidence confidence reflects actual sample', () => {
  assert.equal(analyzeStoreArea('target', stores, recent, [product('p1', { active: false })], [], now).status, 'INSUFFICIENT_DATA');
  assert.equal(analyzeStoreArea('target', stores, recent, [], [], now).status, 'INSUFFICIENT_DATA');
  const peers = Array.from({ length: 5 }, (_, index) => store(`peer${index + 1}`));
  const rows = peers.flatMap((peer, index) => [order(`a${index}`, peer.id), order(`b${index}`, peer.id)]);
  const result = analyzeStoreArea('target', [store('target'), ...peers], rows, [product()], [], now);
  assert.equal(result.confidence, 'HIGH');
  assert.equal(result.recentOrderCount, 10);
  assert.equal(result.recentStoreCount, 5);
  assert.ok(result.opportunityScore! <= 100);
  assert.deepEqual(result, analyzeStoreArea('target', [store('target'), ...peers], rows, [product()], [], now));
});

test('retains only active, currently dated promotions applicable to this exact store or trade type', () => {
  const base = { active: true, validFromAd: '2026-10-01', validToAd: '2026-10-31', applicableStoreTypes: 'ALL' } as Promotion;
  const offers = [
    { ...base, id: 'all' }, { ...base, id: 'gt', applicableStoreTypes: 'GT' }, { ...base, id: 'mt', applicableStoreTypes: 'MT' },
    { ...base, id: 'specific', applicableStoreTypes: 'SPECIFIC', applicableStoreIds: ['target'] },
    { ...base, id: 'other', applicableStoreTypes: 'SPECIFIC', applicableStoreIds: ['other'] },
    { ...base, id: 'expired', validToAd: '2026-10-01' }, { ...base, id: 'future', validFromAd: '2026-11-01' },
    { ...base, id: 'inactive', active: false }, { ...base, id: 'invalid', validFromAd: '2026-02-31' },
  ] as Promotion[];
  assert.deepEqual(applicableStorePromotions(offers, 'target', 'GT', now).map(item => item.id), ['all', 'gt', 'specific']);
});

test('branches use explicit city/area and exact entity type, with separate MT and GT peer groups', () => {
  const branches = stores.map(row => ({ ...row, entityType: 'BRANCH' as const }));
  const branchOrders = recent.map(row => ({ ...row, id: `branch-${row.id}`, entityType: 'BRANCH' as const }));
  const allStores = [...stores, ...branches];
  const result = analyzeStoreArea('target', allStores, [...branchOrders, ...recent.map(row => ({ ...row, items: [{ ...row.items[0], totalUnits: 1000 }] }))], [product()], [count(99)], now, 'BRANCH');
  assert.equal(result.status, 'READY');
  assert.equal(result.recentOrderCount, 3);
  assert.equal(result.peerStoreCount, 2);
  assert.equal(result.trends[0].recentUnits, 30, 'Retailer orders cannot inflate branch demand even with the same IDs and area');
  assert.equal(result.opportunities[0].kind, 'INTRODUCE', 'A retail stock count must not suppress a branch pitch with the same entity ID');
  assert.deepEqual(analyzeStoreArea('target', allStores, branchOrders, [product()], [{ ...count(99), entityType: 'BRANCH' }], now, 'BRANCH').opportunities, []);
  assert.equal(analyzeStoreArea('target', allStores, recent, [product()], [], now, 'BRANCH').status, 'INSUFFICIENT_DATA');
  assert.equal(analyzeStoreArea('target', branches.map(row => ({ ...row, city: undefined, area: undefined })), branchOrders, [product()], [], now, 'BRANCH').status, 'INSUFFICIENT_DATA', 'Historical branches do not get inferred geography');
});

test('store area metadata rejects malformed fields while preserving historical missing values', () => {
  const mutation = { collection: 'branches', id: 'branch1', operation: 'upsert', mutationId: 'area-test-mutation', expectedVersion: 1, data: { id: 'branch1', city: 'Kathmandu', area: 'Baneshwor' } };
  assert.doesNotThrow(() => validateWorkspaceMutation(mutation));
  assert.doesNotThrow(() => validateWorkspaceMutation({ ...mutation, data: { id: 'branch1' } }));
  assert.throws(() => validateWorkspaceMutation({ ...mutation, data: { ...mutation.data, area: 42 } }), /city and area must be text/);
  assert.throws(() => validateWorkspaceMutation({ ...mutation, data: { ...mutation.data, city: 'a'.repeat(101) } }), /city and area must be text/);
  assert.throws(() => validateWorkspaceMutation({ ...mutation, data: { ...mutation.data, area: 'line\nbreak' } }), /city and area must be text/);
});
