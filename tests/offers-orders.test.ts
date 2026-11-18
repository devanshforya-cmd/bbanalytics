import test from 'node:test';
import assert from 'node:assert/strict';
import { saveExtractedOrders } from '../src/lib/db/extractor-service';
import { DatabaseService } from '../src/lib/db/db-service';
import { messageTime, extractSingleOrder } from '../src/lib/whatsapp-extractor';
import { priceTrail } from '../src/lib/order-pricing';
import { DEFAULT_SUPER_ADMIN } from './fixtures';
import type { Brand, Order, Product, SaleCampaign } from '../src/lib/types';

const product = (id: string, name: string, mrp: number): Product => ({ id, name, mrp, brandId: 'b', brandCode: 'BRAND', sku: `SKU-${id}`, category: 'Hair', unitPrice: mrp, thresholdQty: 0, keywords: [], active: true });
const shampoo = product('shampoo', 'Rosemary Shampoo 200ml', 799);
const mini = product('mini', 'Mini Mist', 250);
const brand = { id: 'b', code: 'BRAND', name: 'Brand', isActive: true, status: 'ACTIVE', color: '#000' } as Brand;
const sale: SaleCampaign = { id: 'dashain', name: 'Dashain Sale', brandCodes: ['BRAND'], channels: [], startsAt: '2026-11-01T00:00', endsAt: '2026-11-30T23:59', status: 'SCHEDULED', createdAt: '2026-10-01',
  offers: [
    { id: 'ten', name: 'Dashain 10%', enabled: true, target: { mode: 'ALL' }, condition: {}, reward: { type: 'PERCENT_OFF', percent: 10 }, stacking: 'BEST', priority: 0 },
    { id: 'gift', name: 'Free mini mist above 1,400', enabled: true, target: { mode: 'ALL' }, condition: { minOrderValue: 1400 }, reward: { type: 'FREE_GIFT', giftItemId: 'mini', quantity: 1 }, stacking: 'STACK', priority: 1, limits: { giftStock: 1 } },
  ] };

function workspace(orders: Order[] = [], campaigns = [sale]) {
  const db = new DatabaseService({ server: true }); db.replaceBrands([brand]);
  db.hydrateSnapshot({ products: [shampoo, mini], combos: [], orders, customers: [], influencers: [], campaigns }, DEFAULT_SUPER_ADMIN);
  return { db, commit: async () => {} };
}
const row = (id: string, extra: Record<string, unknown> = {}) => ({ clientId: id, customerName: 'Asha', customerPhone: '9800000001', address: 'Baneshwor', province: '', city: '', orderDateAd: '2026-11-18', orderTime: '14:00',
  platform: 'Instagram', deliveryMethod: 'Pathao', paymentTerms: 'COD', statedPrice: null, discountPercent: null, items: [{ productId: 'shampoo', quantity: 2, expectedUnitPrice: 799 }], ...extra });
const id = (n: number) => `ext_${String(n).padStart(8, '0')}-1111-2222-3333-444444444444`;

test('a sale order records MRP, the offer, the gift and the net price on every line', async () => {
  const ws = workspace();
  await saveExtractedOrders({ orders: [row(id(1))] }, ws);
  const order = ws.db.getOrders()[0];
  assert.equal(order.totalAmount, 1438.2);
  const [paid, gift] = order.items;
  assert.deepEqual([paid.catalogUnitPrice, paid.offerUnitPrice, paid.offerDiscount, paid.customerDiscount, paid.totalPrice], [799, 719.1, 159.8, undefined, 1438.2]);
  assert.deepEqual([gift.productId, gift.isGift, gift.totalPrice, gift.catalogUnitPrice, gift.giftOfferId], ['mini', true, 0, 250, 'gift']);
  assert.deepEqual(order.appliedOffers?.map((entry) => [entry.offerId, entry.amount, entry.giftQuantity]), [['ten', 159.8, undefined], ['gift', 0, 1]]);
  assert.deepEqual(order.campaignIds, ['dashain']); assert.equal(order.orderTime, '14:00'); assert.equal(order.customerDiscount, undefined);
  // The single gift in stock is now used: the next order gets the sale but no gift.
  await saveExtractedOrders({ orders: [row(id(2), { customerPhone: '9800000002' })] }, ws);
  assert.ok(!ws.db.getOrders().find((entry) => entry.customerPhone === '9800000002')!.items.some((item) => item.isGift));
});

test('a written price below the sale price is a customer discount, with its reason', async () => {
  const ws = workspace();
  await saveExtractedOrders({ orders: [row(id(1), { statedPrice: 1400, customerDiscountReason: 'Loyal customer' })] }, ws);
  const order = ws.db.getOrders()[0];
  assert.equal(order.totalAmount, 1400); assert.equal(order.customerDiscount, 38.2); assert.equal(order.customerDiscountReason, 'Loyal customer');
  assert.equal(order.items[0].offerDiscount, 159.8); assert.equal(order.items[0].customerDiscount, 38.2); assert.equal(order.items[0].discountAmount, 198);
});

test('a written price above the sale price is refused; switching the offer off accepts it', async () => {
  await assert.rejects(saveExtractedOrders({ orders: [row(id(1), { statedPrice: 1500 })] }, workspace()), /above the offer price/);
  const ws = workspace();
  await saveExtractedOrders({ orders: [row(id(1), { statedPrice: 1500, disabledOfferIds: ['ten'] })] }, ws);
  const order = ws.db.getOrders()[0];
  assert.equal(order.totalAmount, 1500); assert.deepEqual(order.appliedOffers?.map((entry) => entry.offerId), ['gift']); assert.equal(order.customerDiscount, 98);
});

test('if the sales changed after extraction, the save asks to extract again; outside the sale nothing applies', async () => {
  await assert.rejects(saveExtractedOrders({ orders: [row(id(1), { expectedTotal: 1598 })] }, workspace()), /changed since this order was extracted/);
  const ws = workspace();
  await saveExtractedOrders({ orders: [row(id(1), { orderDateAd: '2026-12-02' })] }, ws);
  const order = ws.db.getOrders()[0];
  assert.equal(order.totalAmount, 1598); assert.equal(order.appliedOffers, undefined); assert.equal(order.items.length, 1);
});

test('the review screen and the server agree, and the WhatsApp time is read', () => {
  assert.equal(messageTime('[16/11/26, 6:32 PM] Sita: Asha'), '18:32');
  assert.equal(messageTime('16/11/2026, 09:05 - Sita: Asha'), '09:05');
  assert.equal(messageTime('[10:31 AM, 16/11/2026] Sita: hi'), '10:31');
  assert.equal(messageTime('Asha\n9800000000'), undefined);
  assert.equal(extractSingleOrder('[18/11/26, 7:15 PM] Sita: Name: Asha\nPhone: 9800000001\nAddress: Baneshwor\nshampoo 2 pcs', { products: [shampoo], combos: [], brands: [brand] }).orderTime, '19:15');
  const trail = priceTrail({ lines: [{ itemId: 'shampoo', name: shampoo.name, quantity: 2, mrp: 799 }], stated: null, percent: 5,
    offers: { brandCode: 'BRAND', channel: 'Instagram', dateAd: '2026-11-18', campaigns: [sale], catalogue: { name: () => 'Mini Mist', price: () => 250 } } });
  // "5% off" during a 10% sale is above the sale price: staff are asked to check.
  assert.match(trail.problem || '', /above the offer price/);
});
