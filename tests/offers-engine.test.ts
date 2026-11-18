import test from 'node:test';
import assert from 'node:assert/strict';
import { priceOrder, campaignState, validateCampaign, campaignOverlaps, offerUsageFrom, allocate, liveCampaigns } from '../src/lib/offers';
import type { SaleCampaign, SaleOffer } from '../src/lib/types';

const offer = (id: string, extra: Partial<SaleOffer>): SaleOffer => ({ id, name: id, enabled: true, target: { mode: 'ALL' }, condition: {}, reward: { type: 'PERCENT_OFF', percent: 10 }, stacking: 'STACK', priority: 0, ...extra });
const campaign = (offers: SaleOffer[], extra: Partial<SaleCampaign> = {}): SaleCampaign => ({ id: 'c1', name: 'Dashain Sale', brandCodes: ['FOR'], channels: [], startsAt: '2026-10-01T00:00', endsAt: '2026-10-10T23:59', status: 'SCHEDULED', offers, createdAt: '2026-09-01', ...extra });
const shampoo = { itemId: 'shampoo', name: 'Shampoo', quantity: 2, mrp: 799 };
const mist = { itemId: 'mist', name: 'Body Mist', quantity: 1, mrp: 599 };
const pair = { itemId: 'pair', name: 'Hair Pair', quantity: 1, mrp: 1518, isCombo: true };
const catalogue = { name: (id: string) => ({ mist: 'Body Mist', gift: 'Mini Mist' } as Record<string, string>)[id], price: (id: string) => ({ mist: 599, gift: 250 } as Record<string, number>)[id] };
const base = { brandCode: 'FOR', channel: 'Instagram', dateAd: '2026-10-03', time: '14:00', catalogue };

test('a flat sale takes its percentage off every item and records it per line', () => {
  const result = priceOrder({ ...base, lines: [shampoo, mist], campaigns: [campaign([offer('ten', { stacking: 'BEST' })])] });
  assert.equal(result.mrpTotal, 2197); assert.equal(result.offerTotal, 1977.3); assert.equal(result.discountTotal, 219.7);
  assert.deepEqual(result.lines.map((line) => line.offerUnitPrice), [719.1, 539.1]);
  assert.deepEqual(result.applied.map((entry) => [entry.offerId, entry.amount, entry.campaignName]), [['ten', 219.7, 'Dashain Sale']]);
});

test('the sale only applies inside its dates, channels, brand, and while scheduled', () => {
  const sale = campaign([offer('ten', {})]);
  assert.equal(priceOrder({ ...base, dateAd: '2026-10-11', lines: [shampoo], campaigns: [sale] }).applied.length, 0);
  assert.equal(priceOrder({ ...base, brandCode: 'TEO', lines: [shampoo], campaigns: [sale] }).applied.length, 0);
  assert.equal(priceOrder({ ...base, lines: [shampoo], campaigns: [{ ...sale, channels: ['Website'] }] }).applied.length, 0);
  assert.equal(priceOrder({ ...base, channel: 'website', lines: [shampoo], campaigns: [{ ...sale, channels: ['Website'] }] }).applied.length, 1);
  for (const status of ['DRAFT', 'PAUSED', 'ENDED'] as const) assert.equal(priceOrder({ ...base, lines: [shampoo], campaigns: [{ ...sale, status }] }).applied.length, 0, status);
  // A 6 pm start: an order at 5 pm that day is not in; one with no time known is judged by the date.
  const evening = { ...sale, startsAt: '2026-10-03T18:00' };
  assert.equal(priceOrder({ ...base, time: '17:00', lines: [shampoo], campaigns: [evening] }).applied.length, 0);
  assert.equal(priceOrder({ ...base, time: undefined, lines: [shampoo], campaigns: [evening] }).applied.length, 1);
  assert.equal(campaignState(evening, '2026-10-03T17:59'), 'Scheduled'); assert.equal(campaignState(evening, '2026-10-03T18:00'), 'Live');
  assert.equal(campaignState(evening, '2026-10-11T00:00'), 'Ended');
});

test('a sale and an offer run together: a gift stacks on top of the sale, tiers and minimum spend use the price after the sale', () => {
  const result = priceOrder({ ...base, lines: [shampoo], campaigns: [campaign([
    offer('ten', { stacking: 'BEST' }),
    offer('gift', { reward: { type: 'FREE_GIFT', giftItemId: 'gift', quantity: 1 }, condition: { minOrderValue: 1400 } }),
  ])] });
  assert.equal(result.offerTotal, 1438.2);
  assert.deepEqual(result.gifts.map((gift) => [gift.itemId, gift.quantity, gift.mrp]), [['gift', 1, 250]]);
  assert.ok(result.applied.some((entry) => entry.offerId === 'gift' && entry.giftValue === 250 && entry.amount === 0));
  const short = priceOrder({ ...base, lines: [{ ...shampoo, quantity: 1 }], campaigns: [campaign([offer('ten', { stacking: 'BEST' }), offer('gift', { reward: { type: 'FREE_GIFT', giftItemId: 'gift', quantity: 1 }, condition: { minOrderValue: 1400 } })])] });
  assert.equal(short.gifts.length, 0);
  assert.ok(short.notes.some((entry) => entry.offerId === 'gift' && entry.message === 'Add NPR 680.9 more.'));
});

test('BEST offers: only the one that saves most; EXCLUSIVE: alone; STACK: adds up', () => {
  const offers = [offer('ten', { stacking: 'BEST' }), offer('fifteen', { stacking: 'BEST', reward: { type: 'PERCENT_OFF', percent: 15 } }), offer('fifty', { stacking: 'STACK', reward: { type: 'AMOUNT_OFF_EACH', amount: 50 } })];
  const best = priceOrder({ ...base, lines: [shampoo], campaigns: [campaign(offers)] });
  assert.deepEqual(best.applied.map((entry) => entry.offerId).sort(), ['fifteen', 'fifty']);
  assert.ok(best.notes.some((entry) => entry.offerId === 'ten' && /saves the customer more/.test(entry.message)));
  const clearance = offer('clear', { stacking: 'EXCLUSIVE', reward: { type: 'FIXED_PRICE', price: 499 } });
  const exclusive = priceOrder({ ...base, lines: [shampoo], campaigns: [campaign([...offers, clearance])] });
  assert.deepEqual(exclusive.applied.map((entry) => entry.offerId), ['clear']); assert.equal(exclusive.offerTotal, 998);
  // Staff switch an offer off for this order.
  const off = priceOrder({ ...base, lines: [shampoo], campaigns: [campaign([...offers, clearance])], disabledOfferIds: ['clear'] });
  assert.ok(!off.applied.some((entry) => entry.offerId === 'clear')); assert.ok(off.candidates.find((entry) => entry.offerId === 'clear')?.disabled);
});

test('targets: combos only, single products only, chosen items, everything except', () => {
  const run = (target: SaleOffer['target']) => priceOrder({ ...base, lines: [shampoo, pair], campaigns: [campaign([offer('t', { target })])] }).lines.map((line) => line.offerDiscount);
  assert.deepEqual(run({ mode: 'COMBOS' }), [0, 151.8]);
  assert.deepEqual(run({ mode: 'SINGLES' }), [159.8, 0]);
  assert.deepEqual(run({ mode: 'ITEMS', itemIds: ['pair'] }), [0, 151.8]);
  assert.deepEqual(run({ mode: 'EXCEPT', itemIds: ['pair'] }), [159.8, 0]);
});

test('buy X get Y, mix & match, tiers and order amount off', () => {
  const bogo = priceOrder({ ...base, lines: [{ ...shampoo, quantity: 3 }, mist], campaigns: [campaign([offer('b', { reward: { type: 'BUY_X_GET_Y', buy: 1, get: 1, percent: 100 } })])] });
  assert.equal(bogo.discountTotal, 599 + 799, 'two pairs: the cheapest unit of each pair is free');
  const mix = priceOrder({ ...base, lines: [{ ...shampoo, quantity: 2 }, mist], campaigns: [campaign([offer('m', { reward: { type: 'BUNDLE_PRICE', pick: 3, price: 1999 } })])] });
  assert.equal(mix.offerTotal, 1999); assert.equal(mix.lines.reduce((sum, line) => sum + line.offerTotal, 0), 1999);
  const tiers = { type: 'TIERED' as const, basis: 'ORDER_VALUE' as const, tiers: [{ min: 2000, percent: 10 }, { min: 3000, percent: 15 }] };
  assert.equal(priceOrder({ ...base, lines: [{ ...shampoo, quantity: 3 }], campaigns: [campaign([offer('t', { reward: tiers })])] }).discountTotal, 239.7);
  assert.equal(priceOrder({ ...base, lines: [{ ...shampoo, quantity: 4 }], campaigns: [campaign([offer('t', { reward: tiers })])] }).discountTotal, 479.4);
  assert.ok(priceOrder({ ...base, lines: [{ ...shampoo, quantity: 1 }], campaigns: [campaign([offer('t', { reward: tiers })])] }).notes.some((entry) => entry.message === 'Add NPR 1,201 more for 10% off.'));
  const amount = priceOrder({ ...base, lines: [shampoo, mist], campaigns: [campaign([offer('a', { reward: { type: 'ORDER_AMOUNT_OFF', amount: 300 }, condition: { minOrderValue: 2000 } })])] });
  assert.equal(amount.discountTotal, 300); assert.equal(amount.lines.reduce((sum, line) => sum + line.offerDiscount, 0), 300);
});

test('conditions: code word, hours, first order, chosen customers, items required together', () => {
  const run = (condition: SaleOffer['condition'], extra = {}) => priceOrder({ ...base, lines: [shampoo, mist], campaigns: [campaign([offer('x', { condition })])], ...extra }).applied.length;
  assert.equal(run({ codeWord: 'DASHAIN10' }, { text: 'shampoo 2\ndashain10' }), 1);
  assert.equal(run({ codeWord: 'DASHAIN10' }, { text: 'shampoo 2' }), 0);
  assert.equal(run({ hours: { from: '18:00', to: '21:00' } }, { time: '19:30' }), 1);
  assert.equal(run({ hours: { from: '18:00', to: '21:00' } }, { time: '14:00' }), 0);
  assert.equal(run({ hours: { from: '18:00', to: '21:00' } }, { time: undefined }), 0);
  assert.equal(run({ firstOrderOnly: true }, { isFirstOrder: false }), 0);
  assert.equal(run({ customerPhones: ['9800000001'] }, { customerPhone: '+977-9800000001' }), 1);
  assert.equal(run({ requiresAll: ['shampoo', 'serum'] }), 0);
});

test('limits and floors: uses per customer, total uses, gift stock, lowest price', () => {
  const orders = [{ id: 'o1', status: 'DELIVERED' as const, customerPhone: '9800000001', appliedOffers: [{ offerId: 'g', offerName: 'g', campaignId: 'c1', campaignName: '', amount: 0, giftQuantity: 2 }] },
    { id: 'o2', status: 'CANCELLED' as const, customerPhone: '9800000002', appliedOffers: [{ offerId: 'g', offerName: 'g', campaignId: 'c1', campaignName: '', amount: 0, giftQuantity: 5 }] }];
  const usage = offerUsageFrom(orders, '9800000001');
  assert.deepEqual(usage('g'), { total: 1, byCustomer: 1, gifts: 2 });
  const gift = offer('g', { reward: { type: 'FREE_GIFT', giftItemId: 'gift', quantity: 1 }, limits: { giftStock: 2 } });
  assert.equal(priceOrder({ ...base, lines: [shampoo], campaigns: [campaign([gift])], usage }).gifts.length, 0, 'out of stock');
  assert.equal(priceOrder({ ...base, lines: [shampoo], campaigns: [campaign([{ ...gift, limits: { perCustomer: 1 } }])], usage }).gifts.length, 0, 'once per customer');
  assert.equal(priceOrder({ ...base, lines: [shampoo], campaigns: [campaign([{ ...gift, limits: { totalUses: 2 } }])], usage }).gifts.length, 1);
  // 30% + 30% stacked, but never below 60% of MRP.
  const floor = priceOrder({ ...base, lines: [{ ...shampoo, quantity: 1 }], campaigns: [campaign([offer('a', { reward: { type: 'PERCENT_OFF', percent: 30 } }), offer('b', { reward: { type: 'PERCENT_OFF', percent: 30 }, floorPercent: 60 })])] });
  assert.equal(floor.offerTotal, 479.4);
});

test('campaign validation, overlaps and exact paisa allocation', () => {
  assert.throws(() => validateCampaign({ name: '', startsAt: '2026-10-01T00:00', endsAt: '2026-10-02T00:00' }), /name/);
  assert.throws(() => validateCampaign({ name: 'X', startsAt: '2026-10-02T00:00', endsAt: '2026-10-01T00:00' }), /after the start/);
  assert.throws(() => validateCampaign({ name: 'X', startsAt: '2026-10-01T00:00', endsAt: '2026-10-02T00:00', status: 'SCHEDULED', offers: [] }), /switched-on offer/);
  assert.throws(() => validateCampaign({ name: 'X', startsAt: '2026-10-01T00:00', endsAt: '2026-10-02T00:00', offers: [{ name: 'Gift', reward: { type: 'FREE_GIFT' } }] }), /choose the gift/);
  const ok = validateCampaign({ name: ' Tihar ', brandCodes: ['for'], channels: ['TikTok'], startsAt: '2026-11-01T00:00', endsAt: '2026-11-05T23:59', status: 'SCHEDULED', offers: [{ id: 'a', name: 'Code', reward: { type: 'PERCENT_OFF', percent: '12.5' }, condition: { codeWord: 'tihar' }, stacking: 'nonsense' }] });
  assert.equal(ok.name, 'Tihar'); assert.deepEqual(ok.brandCodes, ['FOR']); assert.equal(ok.offers[0].condition.codeWord, 'TIHAR'); assert.equal(ok.offers[0].stacking, 'STACK');
  const a = campaign([offer('x', {})]); const b = { ...campaign([offer('y', { stacking: 'EXCLUSIVE' })]), id: 'c2', name: 'Flash', startsAt: '2026-10-05T00:00', endsAt: '2026-10-06T00:00' };
  assert.equal(campaignOverlaps([a, b]).length, 1); assert.match(campaignOverlaps([a, b])[0].message, /only one will apply/);
  assert.equal(campaignOverlaps([a, { ...b, brandCodes: ['TEO'] }]).length, 0);
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.equal(liveCampaigns([{ ...a, isTemplate: true }], base).length, 0, 'templates never apply');
});

test('sale results compare the sale with the same number of days before it', async () => {
  const { saleResults } = await import('../src/lib/sale-results');
  const sale = campaign([offer('ten', {}), offer('gift', { reward: { type: 'FREE_GIFT', giftItemId: 'gift', quantity: 1 }, condition: { minOrderValue: 1000 } })], { startsAt: '2026-10-05T00:00', endsAt: '2026-10-06T23:59' });
  const line = (total: number, extra = {}) => ({ productId: 'shampoo', productName: 'Shampoo', brandCode: 'FOR', quantity: 1, catalogUnitPrice: 799, unitPrice: total, totalPrice: total, ...extra });
  const order = (id: string, date: string, total: number, extra: Record<string, unknown> = {}) => ({ id, orderNumber: id, brandCode: 'FOR', orderDateAd: date, orderDateBs: '', platform: 'Instagram', customerName: 'A', customerPhone: `98000000${id.padStart(2, '0')}`, province: '', district: '', address: '', deliveryMethod: 'Pathao', paymentTerms: 'COD', orderType: 'NEW', items: [line(total)], totalAmount: total, status: 'DELIVERED', source: 'MANUAL', createdAt: '', ...extra }) as any;
  const orders = [
    order('1', '2026-10-03', 799), order('2', '2026-10-04', 799),
    order('3', '2026-10-05', 1050, { items: [line(1050, { offerDiscount: 100, catalogUnitPrice: 1150 }), { ...line(0), isGift: true, catalogUnitPrice: 250 }], campaignIds: ['c1'], appliedOffers: [{ offerId: 'ten', offerName: 'ten', campaignId: 'c1', campaignName: 'Dashain Sale', amount: 100 }, { offerId: 'gift', offerName: 'gift', campaignId: 'c1', campaignName: 'Dashain Sale', amount: 0, giftQuantity: 1, giftValue: 250 }] }),
    order('4', '2026-10-06', 719.1, { items: [line(719.1, { offerDiscount: 79.9 })], campaignIds: ['c1'], appliedOffers: [{ offerId: 'ten', offerName: 'ten', campaignId: 'c1', campaignName: 'Dashain Sale', amount: 79.9 }] }),
    order('5', '2026-10-06', 799, { status: 'CANCELLED' }), order('6', '2026-10-06', 799, { brandCode: 'TEO' }),
  ];
  const result = saleResults(sale, orders, { today: '2026-10-20', failures: [{ id: 'f', orderId: '4' } as any] });
  assert.deepEqual([result.during.from, result.during.to, result.during.orders, result.before.from, result.before.orders], ['2026-10-05', '2026-10-06', 2, '2026-10-03', 2]);
  assert.equal(result.during.netCents, 176910); assert.equal(result.before.netCents, 159800);
  assert.equal(result.lift.net, 10.7); assert.equal(result.during.giftUnits, 1); assert.equal(result.discountCostCents, 17990 + 25000);
  assert.deepEqual(result.offers.map((entry) => [entry.offerId, entry.orders, entry.discountCents, entry.giftUnits, entry.nearThreshold]), [['ten', 2, 17990, 0, 0], ['gift', 1, 0, 1, 1]]);
  assert.equal(result.saleFailureRate, 50); assert.equal(result.pricedOrders, 2);
  assert.ok(result.after && result.after.from === '2026-10-07');
});
