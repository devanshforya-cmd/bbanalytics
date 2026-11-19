import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSingleOrder } from '../src/lib/whatsapp-extractor';
import { saveExtractedOrders } from '../src/lib/db/extractor-service';
import { DatabaseService } from '../src/lib/db/db-service';
import { readEntryMarker, findChangeTarget } from '../src/lib/order-merge';
import { redactRecord, restoreRedacted } from '../src/lib/sensitive-data';
import { resolveAccess } from '../src/lib/roles';
import { DEFAULT_SUPER_ADMIN } from './fixtures';
import type { Brand, Order, Product } from '../src/lib/types';

const product = (id: string, name: string, mrp: number): Product => ({ id, name, mrp, brandId: 'b', brandCode: 'BRAND', sku: `SKU-${id}`, category: 'Care', unitPrice: mrp, thresholdQty: 0, keywords: [], active: true });
const wash = product('wash', 'Exfoliating Body Wash', 719);
const shampoo = product('shampoo', 'Rosemary Shampoo 200ml', 799);
const brand = { id: 'b', code: 'BRAND', name: 'Brand', isActive: true, status: 'ACTIVE', color: '#000' } as Brand;
const options = { products: [wash, shampoo], combos: [], brands: [brand] };
const message = 'Prashna khatri\n9763350725\nSaraswati swastya clinic(tikathali) \nOutside ringroad \n\nexfolaiting body wash \n2 units \n';

function workspace() {
  const db = new DatabaseService({ server: true }); db.replaceBrands([brand]);
  db.hydrateSnapshot({ products: options.products, combos: [], orders: [], customers: [], influencers: [] }, DEFAULT_SUPER_ADMIN);
  return { db, commit: async () => {} };
}
const row = (id: string, extra: Record<string, unknown> = {}) => ({ clientId: id, customerName: 'Prashna khatri', customerPhone: '9763350725', address: 'Tikathali, Outside ringroad', province: '', city: '', orderDateAd: '2026-11-18', platform: 'WhatsApp', deliveryMethod: 'Pathao', paymentTerms: 'COD', statedPrice: null, discountPercent: null, items: [{ productId: 'wash', quantity: 2, expectedUnitPrice: 719 }], ...extra });
const id = (n: number) => `ext_${String(n).padStart(8, '0')}-1111-2222-3333-555555555555`;

test('“order changed” is read from the first line, typos included, and never becomes the name or address', () => {
  for (const first of ['order changed:', 'Order Changed', 'order change -', 'changed order:', 'order chnaged', 'order updated:', 'order edited:']) assert.equal(readEntryMarker(`${first}\nPrashna`).kind, 'CHANGE', first);
  assert.equal(readEntryMarker('Order Change Road, Patan\n98').kind, 'ORDER');
  const changed = extractSingleOrder(`order changed:\n${message}`, options);
  assert.equal(changed.entryKind, 'CHANGE');
  assert.equal(changed.customerName.value, 'Prashna khatri');
  assert.ok(!/changed/i.test(changed.address.value));
});

test('a 1 pm “order changed” replaces the 10 am order: items, price and details, keeping its ID, date and status', async () => {
  const ws = workspace();
  const first = await saveExtractedOrders({ orders: [row(id(1), { orderTime: '10:00' })] }, ws);
  const original = ws.db.getOrders()[0];
  assert.equal(original.totalAmount, 1438);

  const result = await saveExtractedOrders({ orders: [row(id(2), { entryKind: 'CHANGE', orderTime: '13:00', address: 'New Baneshwor, Kathmandu', paymentTerms: 'Prepaid',
    items: [{ productId: 'shampoo', quantity: 1, expectedUnitPrice: 799 }], statedPrice: 750 })] }, ws);
  assert.equal(ws.db.getOrders().length, 1, 'no second order is created');
  const order = ws.db.getOrders()[0];
  assert.equal(order.id, original.id); assert.equal(order.orderNumber, first.orderNumbers[0]); assert.equal(order.orderDateAd, '2026-11-18'); assert.equal(order.status, 'PENDING');
  assert.deepEqual(order.items.map((item) => [item.productId, item.quantity]), [['shampoo', 1]]);
  assert.equal(order.totalAmount, 750); assert.equal(order.statedPrice, 750);
  assert.equal(order.address, 'New Baneshwor, Kathmandu'); assert.equal(order.paymentTerms, 'Prepaid'); assert.equal(order.orderTime, '13:00');
  assert.match(order.notes || '', /Order changed 2026-11-18 13:00: was 2× Exfoliating Body Wash \(NPR 1,438\), now 1× Rosemary Shampoo 200ml \(NPR 750\)/);
  assert.ok(order.editHistory?.length, 'the change is in the order history');
  assert.deepEqual(result.changedOrders, [order.orderNumber]);

  // Pressing save again changes nothing; the same message with other details is refused.
  const again = await saveExtractedOrders({ orders: [row(id(2), { entryKind: 'CHANGE', orderTime: '13:00', address: 'New Baneshwor, Kathmandu', paymentTerms: 'Prepaid', items: [{ productId: 'shampoo', quantity: 1, expectedUnitPrice: 799 }], statedPrice: 750 })] }, ws);
  assert.equal(again.alreadySaved, 1); assert.equal(ws.db.getOrders()[0].totalAmount, 750);
  await assert.rejects(saveExtractedOrders({ orders: [row(id(2), { entryKind: 'CHANGE', items: [{ productId: 'wash', quantity: 9, expectedUnitPrice: 719 }] })] }, ws), /already changed/);
});

test('pasting the 10 am order and the 1 pm change together saves one order with the 1 pm details', async () => {
  const ws = workspace();
  const result = await saveExtractedOrders({ orders: [row(id(3)), row(id(4), { entryKind: 'CHANGE', items: [{ productId: 'wash', quantity: 4, expectedUnitPrice: 719 }] })] }, ws);
  assert.equal(ws.db.getOrders().length, 1);
  assert.deepEqual(ws.db.getOrders()[0].items.map((item) => item.quantity), [4]);
  assert.equal(ws.db.getOrders()[0].totalAmount, 2876);
  assert.equal(result.changedOrders[1], result.orderNumbers[0]);
});

test('a change finds the latest open order in the past week and refuses dispatched or missing orders', async () => {
  const ws = workspace();
  await assert.rejects(saveExtractedOrders({ orders: [row(id(5), { entryKind: 'CHANGE' })] }, ws), /No order for 9763350725/);
  await saveExtractedOrders({ orders: [row(id(6), { orderDateAd: '2026-11-16' })] }, ws);
  // Two days later, the change still finds it.
  await saveExtractedOrders({ orders: [row(id(7), { entryKind: 'CHANGE', items: [{ productId: 'wash', quantity: 3, expectedUnitPrice: 719 }] })] }, ws);
  assert.equal(ws.db.getOrders()[0].items[0].quantity, 3);
  ws.db.setOrderStatus(ws.db.getOrders()[0].id, 'DISPATCHED');
  await assert.rejects(saveExtractedOrders({ orders: [row(id(8), { entryKind: 'CHANGE' })] }, ws), /already dispatched/);

  const base = { brandCode: 'BRAND', customerPhone: '9763350725', status: 'PENDING', items: [], totalAmount: 0 } as unknown as Order;
  const orders = [{ ...base, id: 'old', orderNumber: 'OLD', orderDateAd: '2026-11-01' }, { ...base, id: 'mon', orderNumber: 'MON', orderDateAd: '2026-11-16' }, { ...base, id: 'tue', orderNumber: 'TUE', orderDateAd: '2026-11-17' },
    { ...base, id: 'future', orderNumber: 'FUT', orderDateAd: '2026-11-20' }, { ...base, id: 'ex', orderNumber: 'EX', orderDateAd: '2026-11-18', exchangeRequested: true }] as Order[];
  const found = findChangeTarget(orders, { phone: '9763350725', dateAd: '2026-11-18', brandCode: 'BRAND' });
  assert.equal(found.order?.id, 'tue'); assert.equal(found.others, 1);
});

test('someone without the money switch cannot see or overwrite the earlier total in the change history', () => {
  const viewer = { id: 'v', customPermissions: resolveAccess({ 'p.orders_all': { access: 'VIEW_EDIT', scope: 'ALL', actions: ['VIEW', 'EDIT'] } }, {}, null) } as any;
  const stored = { id: 'o', totalAmount: 750, items: [], extractorChanges: [{ clientId: 'c', hash: 'h', changedAt: 'now', previousTotal: 1438, previousItems: '2× Wash' }] };
  const shown = redactRecord('orders', stored, viewer);
  assert.equal(shown.extractorChanges[0].previousTotal, 0);
  assert.equal(restoreRedacted('orders', shown, stored, viewer).extractorChanges[0].previousTotal, 1438);
});
