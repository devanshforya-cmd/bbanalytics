import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseService } from '../src/lib/db/db-service';
import { DEFAULT_SUPER_ADMIN } from './fixtures';
import {
  awaitingGoods, canClose, legacyStatusFor, packingErrors, returnRowsForMetrics, rtoRateBy, rtoRows, ticketCounts, ticketStageOf, ticketSummary,
  ticketTypeOf, validateReceipt, validateTicketLines, isCustomerReturn,
} from '../src/lib/order-tickets';
import { getTodayAd } from '../src/lib/nepali-calendar';
import type { Brand, DeliveryFailure, Order, Product, ReturnEntry } from '../src/lib/types';

const product = (id: string, name: string, mrp: number): Product => ({ id, name, mrp, brandId: 'b', brandCode: 'BRAND', sku: `SKU-${id}`, category: 'Care', unitPrice: mrp, thresholdQty: 0, keywords: [], active: true });
const A = product('a', 'Body Wash', 700), B = product('b', 'Shampoo', 800), C = product('c', 'Conditioner', 800);
const brand = { id: 'b', code: 'BRAND', name: 'Brand', isActive: true, status: 'ACTIVE', color: '#000' } as Brand;
const order = (id: string, extra: Partial<Order> = {}): Order => ({
  id, orderNumber: `BR-${id}`, brandCode: 'BRAND', orderDateAd: '2026-11-10', orderDateBs: '2083-07-24', platform: 'WhatsApp', customerName: 'Sita', customerPhone: '9800000001',
  province: 'Bagmati', district: 'Kathmandu', address: 'Baneshwor', deliveryMethod: 'Pathao', paymentTerms: 'COD', orderType: 'NEW',
  items: [{ productId: 'a', productName: A.name, brandCode: 'BRAND', quantity: 2, unitPrice: 700, totalPrice: 1400 }, { productId: 'b', productName: B.name, brandCode: 'BRAND', quantity: 1, unitPrice: 800, totalPrice: 800 }],
  totalAmount: 2200, status: 'DELIVERED', source: 'MANUAL', dispatchedDateAd: '2026-11-11', createdAt: '2026-11-10T00:00:00Z', ...extra,
});

function workspace(orders: Order[], failures: DeliveryFailure[] = []) {
  const db = new DatabaseService({ server: true }); db.replaceBrands([brand]);
  db.hydrateSnapshot({ products: [A, B, C], combos: [], orders, customers: [], influencers: [], deliveryFailures: failures } as any, DEFAULT_SUPER_ADMIN);
  return db;
}

test('short shipped: asked for 2, sent 1. Logged as a packing error, not a return, and no goods come back', () => {
  const db = workspace([order('o1')]);
  const ticket = db.addOrderIssue({ type: 'SHORT_SHIPPED', order: db.getOrderById('o1')!, lines: [{ productId: 'a', productName: A.name, brandCode: 'BRAND', kind: 'MISSING', quantity: 1 }], dateAd: '2026-11-12', dateBs: '2083-07-26', packedBy: 'Ram' });
  assert.equal(ticketTypeOf(ticket), 'SHORT_SHIPPED');
  assert.equal(ticket.fault, 'PACKING');
  assert.equal(ticket.expectGoodsBack, false);
  assert.equal(awaitingGoods(ticket), false);
  assert.equal(db.getReturns('ALL').length, 0, 'packing errors never count as customer returns');
  assert.equal(db.getOrderIssues('ALL').length, 1);
  assert.throws(() => db.addOrderIssue({ type: 'SHORT_SHIPPED', order: db.getOrderById('o1')!, lines: [{ productId: 'a', productName: A.name, brandCode: 'BRAND', kind: 'MISSING', quantity: 3 }], dateAd: '2026-11-12', dateBs: '' }), /Only 2 of Body Wash were ordered/);

  // Put it right: resend the missing unit at NPR 0, which is not a sale.
  const resend = db.createResendOrder(ticket.id, { items: [{ productId: 'a', productName: A.name, brandCode: 'BRAND', quantity: 1 }] });
  assert.equal(resend.totalAmount, 0);
  assert.equal(resend.exchangeReturnId, ticket.id);
  db.resolveTicket(ticket.id, { type: 'RESEND' });
  assert.equal(ticketStageOf(db.getOrderIssue(ticket.id)!), 'RESOLVED');
  assert.equal(canClose(db.getOrderIssue(ticket.id)!).ok, true);
  db.moveTicket(ticket.id, 'CLOSED');
  assert.equal(ticketStageOf(db.getOrderIssue(ticket.id)!), 'CLOSED');
});

test('wrong item: sent A and C instead of A and B. C comes back and is tracked until it is received', () => {
  const db = workspace([order('o1')]);
  assert.match(validateTicketLines('WRONG_ITEM', [{ productId: 'c', productName: C.name, brandCode: 'BRAND', kind: 'SENT_WRONG', quantity: 1 }]) || '', /should have received/);
  const ticket = db.addOrderIssue({ type: 'WRONG_ITEM', order: db.getOrderById('o1')!, dateAd: '2026-11-12', dateBs: '',
    lines: [{ productId: 'c', productName: C.name, brandCode: 'BRAND', kind: 'SENT_WRONG', quantity: 1 }, { productId: 'b', productName: B.name, brandCode: 'BRAND', kind: 'SHOULD_HAVE_SENT', quantity: 1 }] });
  assert.equal(ticket.expectGoodsBack, true);
  assert.equal(awaitingGoods(ticket), true);
  db.resolveTicket(ticket.id, { type: 'RESEND' });
  assert.equal(canClose(db.getOrderIssue(ticket.id)!).ok, false, 'cannot close while the wrong product is still with the customer');
  assert.throws(() => db.moveTicket(ticket.id, 'CLOSED'), /not back yet/);
  db.arrangeTicketPickup(ticket.id, { courier: 'Pathao', trackingNo: 'PT-1', inTransit: true });
  assert.equal(ticketStageOf(db.getOrderIssue(ticket.id)!), 'RESOLVED', 'pickup after resolving keeps it resolved');
  assert.throws(() => db.receiveTicketGoods(ticket.id, { dateAd: '2026-11-14', lines: [{ index: 1, receivedQty: 1, condition: 'GOOD' }] }), /not expected back/);
  db.receiveTicketGoods(ticket.id, { dateAd: '2026-11-14', lines: [{ index: 0, receivedQty: 1, condition: 'GOOD' }] });
  const back = db.getOrderIssue(ticket.id)!;
  assert.equal(back.receivedDateAd, '2026-11-14');
  assert.equal(awaitingGoods(back), false);
  db.moveTicket(ticket.id, 'CLOSED');
  assert.equal(packingErrors(db.getOrderIssues('ALL'), 'product')[0].key, B.name, 'the error is counted against the product that should have gone');
});

test('a partial return: goods come back with less than expected and the shortfall is in the timeline', () => {
  const db = workspace([order('o1')]);
  const ret = db.addReturn({ orderId: 'o1', orderNumber: 'BR-o1', brandCode: 'BRAND', productId: 'a', productName: A.name, customerName: 'Sita', customerPhone: '9800000001', dateAd: '2026-11-13', dateBs: '', platform: 'WhatsApp', quantity: 2, reasonCategory: 'Damage', orderStatus: 'Pending', valley: 'Inside', issueCategories: [] });
  assert.equal(ret.stage, 'OPEN');
  assert.equal(isCustomerReturn(ret), true);
  assert.equal(db.getReturns('ALL').length, 1);
  assert.equal(validateReceipt(ret, [{ index: 0, receivedQty: 3, condition: 'GOOD' }]), 'Only 2 of Body Wash were expected back.');
  db.receiveTicketGoods(ret.id, { dateAd: '2026-11-15', lines: [{ index: 0, receivedQty: 1, condition: 'DAMAGED' }] });
  const back = db.getOrderIssue(ret.id)!;
  assert.equal(back.stage, 'RECEIVED');
  assert.match(back.timeline!.at(-1)!.note, /Not in the parcel: 1× Body Wash/);
  db.resolveTicket(ret.id, { type: 'REFUND', amount: 700 });
  assert.equal(db.getOrderIssue(ret.id)!.orderStatus, 'Refunded', 'old screens still read the resolution');
  assert.throws(() => db.resolveTicket(ret.id, { type: 'REFUND' }), /Only an open ticket/);
});

test('marking a delivery failure returned-to-warehouse opens one RTO ticket with every order line', () => {
  const failure: DeliveryFailure = { id: 'f1', orderId: 'o2', orderNumber: 'BR-o2', brandCode: 'BRAND', customerName: 'Sita', customerPhone: '9800000001', dateAd: '2026-11-12', dateBs: '', reason: 'Customer not reachable', valley: 'Inside', status: 'FAILED', deliveryMethod: 'Pathao', createdAt: '2026-11-12T00:00:00Z' };
  const db = workspace([order('o2', { status: 'FAILED' }), order('o3', { deliveryMethod: 'Pathao' }), order('o4', { deliveryMethod: 'NCM' })], [failure]);
  db.updateDeliveryFailure('f1', { status: 'RETURNED_TO_WAREHOUSE' });
  db.updateDeliveryFailure('f1', { status: 'RETURNED_TO_WAREHOUSE' });
  const tickets = db.getOrderIssues('ALL').filter((entry) => entry.ticketType === 'RTO');
  assert.equal(tickets.length, 1, 'never a second ticket for the same parcel');
  assert.equal(tickets[0].lines!.length, 2);
  assert.equal(tickets[0].stage, 'IN_TRANSIT');
  assert.equal(db.getReturns('ALL').length, 0, 'RTO is not a customer return');

  const rows = rtoRows(db.getDeliveryFailures('ALL'), db.getOrderIssues('ALL'), db.getOrders('ALL'), '2099-01-01');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].back, false);
  assert.equal(rows[0].value, 2200);
  const byCourier = rtoRateBy(rows, db.getOrders('ALL'), (o) => o.deliveryMethod, (r) => r.courier);
  const pathao = byCourier.find((row) => row.key === 'Pathao')!;
  assert.deepEqual([pathao.shipped, pathao.rto, pathao.ratePct, pathao.notBack], [2, 1, 50, 1]);

  db.receiveTicketGoods(tickets[0].id, { dateAd: getTodayAd(), lines: [{ index: 0, receivedQty: 2, condition: 'GOOD' }, { index: 1, receivedQty: 1, condition: 'GOOD' }] });
  const after = rtoRows(db.getDeliveryFailures('ALL'), db.getOrderIssues('ALL'), db.getOrders('ALL'), '2026-11-20')[0];
  assert.equal(after.back, true);
  assert.equal(after.receivedDateAd, getTodayAd());
  assert.equal(ticketCounts(db.getOrderIssues('ALL')).rto, 1);
});

test('old returns read as tickets without changes, and multi-product tickets count once per product in metrics', () => {
  const old = { id: 'r1', orderStatus: 'Refunded', productId: 'a', productName: A.name, brandCode: 'BRAND', quantity: 1, dateAd: '2026-10-01', reasonCategory: 'Damage' } as ReturnEntry;
  assert.equal(ticketTypeOf(old), 'RETURN');
  assert.equal(ticketStageOf(old), 'RESOLVED');
  assert.equal(awaitingGoods(old), false, 'an old row has no arrival record, so it is not shown as missing');
  assert.equal(ticketStageOf({ ...old, orderStatus: 'Pending' }), 'OPEN');
  assert.equal(legacyStatusFor('RESOLVED', 'EXCHANGE'), 'Exchanged');
  assert.equal(legacyStatusFor('RECEIVED'), 'Pending');
  const multi = { ...old, id: 'r2', lines: [{ productId: 'a', productName: A.name, brandCode: 'BRAND', kind: 'BACK', quantity: 1 }, { productId: 'b', productName: B.name, brandCode: 'BRAND', kind: 'BACK', quantity: 2 }] } as ReturnEntry;
  const rows = returnRowsForMetrics([old, multi, { ...old, id: 'r3', ticketType: 'RTO' } as ReturnEntry]);
  assert.deepEqual(rows.map((row) => [row.id, row.productId, row.quantity]), [['r1', 'a', 1], ['r2', 'a', 1], ['r2#1', 'b', 2]]);
  const summary = ticketSummary([old, multi]);
  assert.equal(summary.find((row) => row.type === 'RETURN')!.total, 2);
});
