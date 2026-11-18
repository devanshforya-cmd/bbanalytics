import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSingleOrder, extractedDiscount, percentDiscountTotal } from '../src/lib/whatsapp-extractor';
import { saveExtractedOrders } from '../src/lib/db/extractor-service';
import { DatabaseService } from '../src/lib/db/db-service';
import { readEntryMarker, findAddOnTarget, mergeOrderItems } from '../src/lib/order-merge';
import { returnableLines, returnedProductLabel } from '../src/lib/return-lines';
import { countsAsSale } from '../src/lib/order-status';
import { exchangeAnalysis, isExchangeOrder, waitingExchangeOrders } from '../src/lib/exchange';
import { DEFAULT_SUPER_ADMIN } from './fixtures';
import type { Brand, Combo, Order, Product, ReturnEntry } from '../src/lib/types';

const product = (id: string, name: string, mrp: number): Product => ({ id, name, mrp, brandId: 'b', brandCode: 'BRAND', sku: `SKU-${id}`, category: 'Care', unitPrice: mrp, thresholdQty: 0, keywords: [], active: true });
const wash = product('wash', 'Exfoliating Body Wash', 719);
const shampoo = product('shampoo', 'Rosemary Shampoo 200ml', 799);
const conditioner = product('conditioner', 'Rosemary Conditioner 200ml', 799);
const pair: Combo = { id: 'pair', brandCode: 'BRAND', name: 'Hair Care Pair', sku: 'PAIR-1', description: '', items: [{ productId: 'shampoo', productName: shampoo.name, quantity: 1, mrp: 799 }, { productId: 'conditioner', productName: conditioner.name, quantity: 1, mrp: 799 }], componentProductIds: ['shampoo', 'conditioner'], totalOriginalMrp: 1598, comboPrice: 1518, comboMrp: 1518, savingsPct: 5, extractorKeywords: ['hair pair'], priceDetectionEnabled: true, active: true, createdAt: '2026-01-01' };
const brand = { id: 'b', code: 'BRAND', name: 'Brand', isActive: true, status: 'ACTIVE', color: '#000' } as Brand;
const options = { products: [wash, shampoo, conditioner], combos: [pair], brands: [brand] };
const message = 'Prashna khatri\n9763350725\nSaraswati swastya clinic(tikathali) \nOutside ringroad \n\nexfolaiting body wash \n5 units \n';

test('a percentage discount is applied to the order and rounded to whole rupees', () => {
  const order = extractSingleOrder(`${message}5% off`, options);
  assert.equal(order.entryKind, 'ORDER');
  assert.deepEqual(order.products.map((item) => [item.productId, item.quantity]), [['wash', 5]]);
  assert.equal(order.totalAmount.value, 3415);
  assert.deepEqual(extractedDiscount(order), { amount: 180, percent: 5 });
  assert.deepEqual(order.extractionErrors, []);
  assert.equal(percentDiscountTotal(1598, 10), 1438);
});

test('a written total sets the sale amount and the discount is worked out from it, without a review warning', () => {
  const order = extractSingleOrder(`${message}total 3415`, options);
  assert.equal(order.totalAmount.value, 3415);
  assert.deepEqual(extractedDiscount(order), { amount: 180, percent: 5 });
  assert.ok(!order.flags.some((flag) => /review|differs/i.test(flag)), order.flags.join(' | '));
  const tooLow = extractSingleOrder(`${message}total 1000`, options);
  assert.ok(tooLow.flags.some((flag) => flag.includes('below the catalogue price')));
});

test('“order added” and “exchange” markers are read from the first line only and never become the address', () => {
  assert.equal(readEntryMarker('order added:\nPrashna').kind, 'ADD_ON');
  assert.equal(readEntryMarker('Order Added\nPrashna').kind, 'ADD_ON');
  assert.equal(readEntryMarker('exchange: Prashna khatri').body, 'Prashna khatri');
  assert.equal(readEntryMarker('Exchange Road, Lalitpur\n98').kind, 'ORDER');
  assert.equal(readEntryMarker('Prashna\nexchange:').kind, 'ORDER');
  const added = extractSingleOrder(`order added:\n${message}`, options);
  assert.equal(added.entryKind, 'ADD_ON'); assert.equal(added.customerName.value, 'Prashna khatri');
  const exchange = extractSingleOrder(`exchange:\n${message}`, options);
  assert.equal(exchange.entryKind, 'EXCHANGE'); assert.ok(!/exchange/i.test(exchange.address.value));
});

test('an exchange collects nothing unless an amount is written, and a written amount replaces the price', () => {
  assert.equal(extractSingleOrder(`exchange:\n${message}`, options).totalAmount.value, 0);
  assert.equal(extractSingleOrder(`exchange:\n${message}cod 500`, options).totalAmount.value, 500);
  const percent = extractSingleOrder(`exchange:\n${message}5% off`, options);
  assert.equal(percent.totalAmount.value, 0); assert.ok(percent.flags.some((flag) => flag.includes('percentage was ignored')));
});

function workspace(orders: Order[] = []) {
  const db = new DatabaseService({ server: true }); db.replaceBrands([brand]);
  db.hydrateSnapshot({ products: options.products, combos: options.combos, orders, customers: [], influencers: [] }, DEFAULT_SUPER_ADMIN);
  let commits = 0; return { db, commit: async () => { commits++; }, get commits() { return commits; } };
}
const row = (id: string, extra: Record<string, unknown> = {}) => ({ clientId: id, customerName: 'Prashna khatri', customerPhone: '9763350725', address: 'Saraswati swastya clinic(tikathali), Outside ringroad', province: '', city: '', orderDateAd: '2026-11-18', platform: 'WhatsApp', deliveryMethod: 'Pathao', paymentTerms: 'COD', statedPrice: null, discountPercent: null, items: [{ productId: 'wash', quantity: 5, expectedUnitPrice: 719 }], ...extra });
const id = (n: number) => `ext_${String(n).padStart(8, '0')}-1111-2222-3333-444444444444`;

test('server saves 5% off and a written total as the same correct sale amount', async () => {
  const ws = workspace();
  await saveExtractedOrders({ orders: [row(id(1), { discountPercent: 5 }), row(id(2), { statedPrice: 3415, customerPhone: '9800000002' })] }, ws);
  const [b, a] = ws.db.getOrders();
  for (const order of [a, b]) { assert.equal(order.totalAmount, 3415); assert.equal(order.items[0].totalPrice, 3415); assert.equal(order.items[0].discountAmount, 180); }
});

test('“order added” joins the same customer’s order of the same date: in one batch, from an earlier save, and never twice', async () => {
  const ws = workspace();
  const batch = await saveExtractedOrders({ orders: [row(id(1), { discountPercent: 5 }), row(id(2), { entryKind: 'ADD_ON', items: [{ productId: 'shampoo', quantity: 1, expectedUnitPrice: 799 }, { productId: 'wash', quantity: 1, expectedUnitPrice: 719 }] })] }, ws);
  assert.equal(ws.db.getOrders().length, 1);
  const order = ws.db.getOrders()[0];
  assert.deepEqual(order.items.map((item) => [item.productId, item.quantity, item.totalPrice]), [['wash', 6, 4134], ['shampoo', 1, 799]]);
  assert.equal(order.totalAmount, 3415 + 799 + 719);
  assert.equal(order.discountPercent, undefined, 'the 5% no longer describes the whole order');
  assert.deepEqual(batch.addedTo, [null, batch.orderNumbers[0]]);
  assert.equal(ws.db.getCustomers()[0].totalOrders, 1, 'an add-on is not a new order for the customer');

  // A later message the same day goes into the saved order.
  const later = await saveExtractedOrders({ orders: [row(id(3), { entryKind: 'ADD_ON', statedPrice: 700, items: [{ productId: 'conditioner', quantity: 1, expectedUnitPrice: 799 }] })] }, ws);
  const updated = ws.db.getOrders()[0];
  assert.equal(ws.db.getOrders().length, 1); assert.equal(updated.totalAmount, 3415 + 799 + 719 + 700);
  assert.equal(updated.extractorAddOns?.length, 2); assert.match(updated.notes || '', /Order added 2026-11-18: 1× Rosemary Conditioner/);
  assert.ok(updated.editHistory?.length, 'the change is in the order history');
  // Pressing save again changes nothing.
  const retry = await saveExtractedOrders({ orders: [row(id(3), { entryKind: 'ADD_ON', statedPrice: 700, items: [{ productId: 'conditioner', quantity: 1, expectedUnitPrice: 799 }] })] }, ws);
  assert.equal(retry.alreadySaved, 1); assert.equal(ws.db.getOrders()[0].totalAmount, updated.totalAmount);
  assert.equal(later.addedTo[0], updated.orderNumber);
});

test('“order added” is refused when there is nothing open to add to, so it can be saved as a new order instead', async () => {
  await assert.rejects(saveExtractedOrders({ orders: [row(id(5), { entryKind: 'ADD_ON' })] }, workspace()), /No order for 9763350725 on 2026-11-18/);
  const ws = workspace();
  await saveExtractedOrders({ orders: [row(id(6))] }, ws);
  ws.db.setOrderStatus(ws.db.getOrders()[0].id, 'DISPATCHED');
  await assert.rejects(saveExtractedOrders({ orders: [row(id(7), { entryKind: 'ADD_ON' })] }, ws), /already dispatched/);
  await assert.rejects(saveExtractedOrders({ orders: [row(id(8), { entryKind: 'ADD_ON', orderDateAd: '2026-11-17' })] }, ws), /No order for/);
  // Without the words "order added", the same customer can place a second order the same day.
  await saveExtractedOrders({ orders: [row(id(9))] }, ws); assert.equal(ws.db.getOrders().length, 2);
});

test('the add-on target ignores other customers, other days, exchanges and marketing, and picks the latest open order', () => {
  const base = { brandCode: 'BRAND', orderDateAd: '2026-11-18', customerPhone: '9763350725', status: 'PENDING', items: [], totalAmount: 0 } as unknown as Order;
  const orders = [
    { ...base, id: 'a', orderNumber: 'A', createdAt: '2026-11-18T01:00:00Z' }, { ...base, id: 'b', orderNumber: 'B', createdAt: '2026-11-18T05:00:00Z' },
    { ...base, id: 'x', orderNumber: 'X', createdAt: '2026-11-18T09:00:00Z', exchangeRequested: true },
    { ...base, id: 'y', orderNumber: 'Y', createdAt: '2026-11-18T09:00:00Z', customerPhone: '9800000000' },
  ] as Order[];
  const found = findAddOnTarget(orders, { phone: '+977 976-3350725', dateAd: '2026-11-18', brandCode: 'BRAND' });
  assert.equal(found.order?.id, 'b'); assert.equal(found.others, 1);
  assert.match(findAddOnTarget(orders, { phone: '9763350725', dateAd: '2026-11-18', brandCode: 'OTHER' }).problem || '', /another brand/);
  assert.deepEqual(mergeOrderItems([{ productId: 'p', productName: 'P', brandCode: 'B', quantity: 1, unitPrice: 100, totalPrice: 100 }], [{ productId: 'p', productName: 'P', brandCode: 'B', quantity: 2, unitPrice: 90, totalPrice: 180 }])[0].unitPrice, 93.33);
});

test('an exchange is saved as its own NPR 0 order, is not a sale, and waits for its return to be linked manually', async () => {
  const ws = workspace();
  await saveExtractedOrders({ orders: [row(id(1))] }, ws);
  const original = ws.db.getOrders()[0];
  ws.db.setOrderStatus(original.id, 'DELIVERED');
  const karma = ws.db.getCustomers()[0].karmaScore;
  await saveExtractedOrders({ orders: [row(id(2), { entryKind: 'EXCHANGE', items: [{ productId: 'wash', quantity: 1, expectedUnitPrice: 719 }] })] }, ws);
  const exchange = ws.db.getOrders().find((order) => order.exchangeRequested)!;
  assert.equal(exchange.totalAmount, 0); assert.equal(exchange.items[0].totalPrice, 0); assert.equal(exchange.items[0].discountAmount, undefined);
  assert.equal(countsAsSale(exchange), false); assert.equal(isExchangeOrder(exchange), true);
  assert.equal(ws.db.getCustomers()[0].karmaScore, karma, 'an exchange earns no order karma');
  assert.equal(ws.db.getReturns('ALL').length, 0, 'no return is created automatically');
  assert.deepEqual(waitingExchangeOrders(ws.db.getOrders(), '9763350725').map((order) => order.id), [exchange.id]);
  assert.equal(exchangeAnalysis([], ws.db.getOrders()).awaitingReturn, 1);
  // A written amount is what the rider collects.
  await saveExtractedOrders({ orders: [row(id(3), { entryKind: 'EXCHANGE', statedPrice: 500, items: [{ productId: 'wash', quantity: 1, expectedUnitPrice: 719 }] })] }, ws);
  assert.equal(ws.db.getOrders().find((order) => order.id === `ord_${id(3)}`)?.totalAmount, 500);
  await assert.rejects(saveExtractedOrders({ orders: [row(id(4), { entryKind: 'EXCHANGE', discountPercent: 5 })] }, ws), /amount to collect instead of a percentage/);

  // When the return is logged, staff link it.
  const ret = ws.db.addReturn({ orderId: original.id, orderNumber: original.orderNumber, brandCode: 'BRAND', productId: 'wash', productName: wash.name, customerName: original.customerName, customerPhone: original.customerPhone, dateAd: '2026-11-18', dateBs: '', platform: 'WhatsApp', quantity: 1, reasonCategory: 'Damage', orderStatus: 'Pending', valley: 'Outside', issueCategories: [] });
  ws.db.linkExchangeOrder(ret.id, exchange.id);
  const linked = ws.db.getOrderById(exchange.id)!;
  assert.equal(linked.exchangeReturnId, ret.id); assert.equal(waitingExchangeOrders(ws.db.getOrders(), '9763350725').length, 1, 'only the other exchange still waits');
  assert.equal(ws.db.getReturns('ALL')[0].orderStatus, 'Exchanged');
});

test('one product of a combo can be returned on its own; the whole combo then counts only complete sets', () => {
  const order = { id: 'o1', brandCode: 'BRAND', items: [{ productId: 'pair', productName: 'Hair Care Pair', brandCode: 'BRAND', quantity: 2, unitPrice: 1518, totalPrice: 3036 }, { productId: 'wash', productName: wash.name, brandCode: 'BRAND', quantity: 1, unitPrice: 719, totalPrice: 719 }] } as Order;
  const ret = (productId: string, quantity: number, combo = false, status: ReturnEntry['orderStatus'] = 'Pending') => ({ orderId: 'o1', productId, quantity, orderStatus: status, ...(combo ? { comboId: 'pair', comboName: 'Hair Care Pair' } : {}) }) as ReturnEntry;
  const fresh = returnableLines(order, [pair], []);
  assert.deepEqual(fresh.map((line) => [line.key, line.remaining]), [['pair', 2], ['pair::shampoo', 2], ['pair::conditioner', 2], ['wash', 1]]);
  const oneShampoo = returnableLines(order, [pair], [ret('shampoo', 1, true)]);
  assert.deepEqual(oneShampoo.map((line) => [line.key, line.remaining]), [['pair', 1], ['pair::shampoo', 1], ['pair::conditioner', 2], ['wash', 1]]);
  const wholeOne = returnableLines(order, [pair], [ret('pair', 1), ret('shampoo', 1, true), ret('wash', 1, false, 'Rejected')]);
  assert.deepEqual(wholeOne.map((line) => [line.key, line.remaining]), [['pair', 0], ['pair::shampoo', 0], ['pair::conditioner', 1], ['wash', 1]]);
  assert.equal(returnedProductLabel({ productName: shampoo.name, comboName: 'Hair Care Pair' }), 'Rosemary Shampoo 200ml (from Hair Care Pair)');
});
