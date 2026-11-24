/**
 * Test data for the online side: customers who come back (or don't), orders across channels and
 * couriers, deliveries that fail, returns, follow-up calls and other customer calls, reviews with
 * star ratings, and a few notifications. One simulated history, so the numbers agree with each
 * other: a customer's totals match their orders, a failed order has a failure record, and so on.
 */
import type { TicketStage } from '../order-tickets';
import { brandPrefix } from '../document-ids';
import { calculateCustomerSegment, evaluateCustomerFlags } from '../karma-calculator';
import { DEFAULT_FAILURE_REASONS } from '../marketing';
import { DEFAULT_FOLLOW_UP_PLAN, addDays } from '../follow-ups';
import type {
  Customer, CustomerCall, CustomerCallOutcome, DeliveryFailure, FeedbackEntry, Notification, Order, OrderItem, Product, ReturnEntry, ReturnReason,
} from '../types';

export interface OnlineContext {
  random: () => number;
  today: string;
  bs: (dateAd: string) => string;
  at: (dateAd: string, hour: number, minute?: number) => string;
  add: <T extends { id: string }>(collection: string, data: T) => T;
  products: Product[];
  desk: { id: string; name: string }[];
  manager: { id: string; name: string };
  brandPrefixes?: Record<string, string> | null;
}

const PLACES: { district: string; province: string; city: string; area: string; valley: 'Inside' | 'Outside' }[] = [
  { district: 'Kathmandu', province: 'Bagmati Province', city: 'Kathmandu', area: 'Baneshwor', valley: 'Inside' },
  { district: 'Kathmandu', province: 'Bagmati Province', city: 'Kathmandu', area: 'Thamel', valley: 'Inside' },
  { district: 'Kathmandu', province: 'Bagmati Province', city: 'Kathmandu', area: 'Budhanilkantha', valley: 'Inside' },
  { district: 'Kathmandu', province: 'Bagmati Province', city: 'Kathmandu', area: 'Kalanki', valley: 'Inside' },
  { district: 'Lalitpur', province: 'Bagmati Province', city: 'Lalitpur', area: 'Jhamsikhel', valley: 'Inside' },
  { district: 'Lalitpur', province: 'Bagmati Province', city: 'Lalitpur', area: 'Imadol', valley: 'Inside' },
  { district: 'Bhaktapur', province: 'Bagmati Province', city: 'Bhaktapur', area: 'Suryabinayak', valley: 'Inside' },
  { district: 'Kaski', province: 'Gandaki Province', city: 'Pokhara', area: 'Lakeside', valley: 'Outside' },
  { district: 'Rupandehi', province: 'Lumbini Province', city: 'Butwal', area: 'Traffic Chowk', valley: 'Outside' },
  { district: 'Sunsari', province: 'Koshi Province', city: 'Dharan', area: 'Bhanu Chowk', valley: 'Outside' },
  { district: 'Morang', province: 'Koshi Province', city: 'Biratnagar', area: 'Main Road', valley: 'Outside' },
  { district: 'Chitwan', province: 'Bagmati Province', city: 'Bharatpur', area: 'Narayangarh', valley: 'Outside' },
  { district: 'Kailali', province: 'Sudurpashchim Province', city: 'Dhangadhi', area: 'Chauraha', valley: 'Outside' },
];

const FIRST = ['Aarati', 'Aashma', 'Anusha', 'Bibek', 'Binita', 'Deepa', 'Dikshya', 'Garima', 'Isha', 'Jenisha', 'Kabita', 'Karishma', 'Kritika', 'Laxmi', 'Manisha',
  'Nabin', 'Niraj', 'Nisha', 'Pooja', 'Prakriti', 'Prasansha', 'Rabina', 'Riya', 'Roshan', 'Sabina', 'Sagar', 'Sajina', 'Samir', 'Sandhya', 'Sanjana',
  'Shreya', 'Simran', 'Sneha', 'Sonam', 'Sudip', 'Sujata', 'Sunil', 'Swastika', 'Trishna', 'Usha'];
const LAST = ['Adhikari', 'Bhandari', 'Basnet', 'Chaudhary', 'Gurung', 'Karki', 'KC', 'Khadka', 'Lama', 'Magar', 'Maharjan', 'Pandey', 'Poudel', 'Rai', 'Shah', 'Sharma', 'Shrestha', 'Tamang', 'Thapa', 'Yadav'];

const CHANNELS: [string, number][] = [['Instagram', 34], ['TikTok', 26], ['WhatsApp', 14], ['Messenger', 10], ['Website', 10], ['Facebook', 6]];
const INSIDE_COURIERS: [string, number][] = [['Pathao', 40], ['In-house Rider', 30], ['InDrive', 10], ['Standard', 20]];
const OUTSIDE_COURIERS: [string, number][] = [['Standard', 50], ['Pathao', 30], ['Nepal Post', 20]];
const RETURN_REASONS: [ReturnReason, number][] = [['Damage', 30], ['Wrong product sent', 20], ['Product not as described', 15], ['Quality defect', 15], ['Changed mind', 12], ['Allergic reaction', 8]];

export function generateOnlineSample(ctx: OnlineContext) {
  const { random, today, bs, at, add, products, desk, manager } = ctx;
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const between = (min: number, max: number) => Math.round(min + random() * (max - min));
  const chance = (p: number) => random() < p;
  const weighted = <T,>(list: readonly [T, number][]) => { let roll = random() * list.reduce((s, [, w]) => s + w, 0); for (const [v, w] of list) { if ((roll -= w) <= 0) return v; } return list[0][0]; };
  const dayAd = (offset: number) => addDays(today, -offset);
  const time = () => `${String(between(8, 22)).padStart(2, '0')}:${String(between(0, 59)).padStart(2, '0')}`;

  const byBrand = new Map<string, Product[]>();
  for (const p of products.filter((p) => !p.isCombo && p.active !== false)) byBrand.set(p.brandCode, [...(byBrand.get(p.brandCode) || []), p]);
  const brandWeights: [string, number][] = [...byBrand.keys()].map((code) => [code, code === 'FORYA' ? 45 : code === 'RENEE' ? 30 : 25]);
  if (!brandWeights.length) return { orders: [] as Order[] };

  // Customers ----------------------------------------------------------------------------------
  type Sim = { id: string; name: string; phone: string; place: typeof PLACES[number]; address: string; brand: string; orders: Order[]; habit: 'once' | 'twice' | 'regular' | 'loyal' | 'trouble'; start: number };
  const sims: Sim[] = [];
  for (let i = 0; i < 72; i += 1) {
    const place = PLACES[i % 9 === 0 ? 8 + (i % 5) : between(0, PLACES.length - 1)];
    const habit: Sim['habit'] = i < 6 ? 'loyal' : i < 16 ? 'regular' : i < 32 ? 'twice' : i < 36 ? 'trouble' : 'once';
    sims.push({ id: `sample_cust_${i + 1}`, name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`, phone: `9700${String(100000 + i * 137).slice(0, 6)}`,
      place, address: `${place.area}, ${place.city}`, brand: weighted(brandWeights), orders: [], habit, start: habit === 'once' ? between(0, 110) : between(40, 120) });
  }

  // Orders ---------------------------------------------------------------------------------------
  const numbers = new Map<string, number>();
  const nextNumber = (brand: string) => { const n = (numbers.get(brand) || 9000) + 1; numbers.set(brand, n); return `${brandPrefix(brand, ctx.brandPrefixes)}-${n}`; };
  const orders: Order[] = [];
  const failures: DeliveryFailure[] = [];
  const returns: ReturnEntry[] = [];
  const rtoTickets: ReturnEntry[] = [];
  let deskTurn = 0;

  const makeOrder = (sim: Sim, offset: number, first: boolean) => {
    const brand = chance(0.85) ? sim.brand : weighted(brandWeights);
    const range = byBrand.get(brand)!;
    const lines = Math.min(range.length, chance(0.6) ? 1 : chance(0.7) ? 2 : 3);
    const chosen = [...range].sort(() => random() - 0.5).slice(0, lines);
    const discountPct = chance(0.25) ? pick([5, 10]) : 0;
    const items: OrderItem[] = chosen.map((p) => {
      const quantity = chance(0.75) ? 1 : 2;
      const unit = Math.round(p.mrp * (1 - discountPct / 100));
      const off = (p.mrp - unit) * quantity;
      return { productId: p.id, productName: p.name, brandCode: p.brandCode, subBrandId: p.subBrandId, quantity, unitPrice: unit, totalPrice: unit * quantity,
        catalogUnitPrice: p.mrp, ...(off ? { discountAmount: off, customerDiscount: off } : {}) };
    });
    const total = items.reduce((s, i) => s + i.totalPrice, 0);
    const dateAd = dayAd(offset);
    // How far along the order is depends on its age, with the odd one going wrong.
    const troubled = sim.habit === 'trouble';
    let status: Order['status'];
    if (offset <= 1) status = offset === 1 && chance(0.5) ? 'DISPATCHED' : 'PENDING';
    else if (offset <= 3) status = chance(0.8) ? 'DISPATCHED' : 'DELIVERED';
    else {
      const roll = random();
      status = roll < (troubled ? 0.25 : 0.05) ? 'FAILED' : roll < (troubled ? 0.4 : 0.09) ? 'CANCELLED' : roll < (troubled ? 0.55 : 0.14) ? 'RETURNED'
        : offset <= 8 && chance(0.25) ? 'DISPATCHED' : 'DELIVERED';
    }
    const inside = sim.place.valley === 'Inside';
    const handler = desk[deskTurn++ % desk.length] || manager;
    const dispatched = status === 'PENDING' || status === 'CANCELLED' && chance(0.6) ? undefined : addDays(dateAd, 1);
    const delivered = status === 'DELIVERED' || status === 'RETURNED' ? addDays(dateAd, inside ? between(1, 2) : between(3, 5)) : undefined;
    const order = add<Order>('orders', {
      id: `sample_order_${orders.length + 1}`, orderNumber: nextNumber(brand), brandCode: brand, orderDateAd: dateAd, orderDateBs: bs(dateAd), orderTime: time(),
      platform: weighted(CHANNELS), customerName: sim.name, customerPhone: sim.phone, province: sim.place.province, district: sim.place.district, address: sim.address,
      deliveryMethod: weighted(inside ? INSIDE_COURIERS : OUTSIDE_COURIERS), paymentTerms: chance(0.8) ? 'COD' : 'Prepaid', orderType: first ? 'NEW' : 'REPEAT',
      items, totalAmount: total, ...(discountPct ? { discountPercent: discountPct, customerDiscount: items.reduce((s, i) => s + (i.customerDiscount || 0), 0), customerDiscountReason: 'Repeat customer' } : {}),
      assignedToId: handler.id, assignedToName: handler.name, status, source: chance(0.6) ? 'WHATSAPP_EXTRACTOR' : 'MANUAL',
      dispatchedDateAd: dispatched, deliveredDateAd: delivered, cancelledDateAd: status === 'CANCELLED' ? addDays(dateAd, 1) : undefined,
      notes: status === 'CANCELLED' ? pick(['Customer changed their mind on the call.', 'Duplicate order, customer ordered twice.', 'Out of stock, customer did not want to wait.']) : undefined,
      createdAt: at(dateAd, between(9, 21)), createdById: handler.id,
    } as Order & { createdById: string });
    orders.push(order);
    sim.orders.push(order);

    if (status === 'FAILED' || (status === 'DELIVERED' && chance(0.06))) {
      // A failed attempt; some were tried again and got through.
      const reason = pick(DEFAULT_FAILURE_REASONS.filter((r) => r !== 'Other'));
      const failedAd = addDays(dateAd, inside ? 2 : 4);
      const recovered = status === 'DELIVERED';
      const recent = offset <= 10 && !recovered;
      // Older failures that were never delivered went back to the warehouse (RTO); most are checked in, a few are still on the way.
      const rto = !recovered && offset > 14 && chance(0.6);
      const rtoAd = addDays(failedAd, 3);
      const backAd = rto && offset > 20 && chance(0.75) ? addDays(rtoAd, between(2, 6)) : undefined;
      if (rto) {
        const lines = items.map((i) => ({ productId: i.productId, productName: i.productName, brandCode: i.brandCode, kind: 'BACK' as const, quantity: i.quantity,
          ...(backAd ? { receivedQty: i.quantity, condition: chance(0.85) ? 'GOOD' as const : 'DAMAGED' as const } : {}) }));
        rtoTickets.push(add<ReturnEntry>('returns', {
          id: `sample_rto_${rtoTickets.length + 1}`, orderId: order.id, orderNumber: order.orderNumber, brandCode: brand, productId: items[0].productId,
          productName: items.length > 1 ? `${items[0].productName} +${items.length - 1} more` : items[0].productName, customerName: sim.name, customerPhone: sim.phone,
          dateAd: rtoAd, dateBs: bs(rtoAd), orderProcessedDateAd: dateAd, orderProcessedDateBs: bs(dateAd), platform: order.platform, quantity: items.reduce((s, i) => s + i.quantity, 0),
          reasonCategory: 'Returned to origin', orderStatus: backAd ? 'Returned' : 'Pending', valley: sim.place.valley, issueCategories: [],
          ticketType: 'RTO', stage: backAd ? 'CLOSED' : 'IN_TRANSIT', lines, expectGoodsBack: true, fault: 'COURIER', courier: order.deliveryMethod,
          deliveryFailureId: `sample_df_${failures.length + 1}`,
          ...(backAd ? { receivedDateAd: backAd, receivedBy: handler.name, resolution: { type: 'NO_ACTION' as const, dateAd: backAd, by: handler.name }, resolvedDateAd: backAd } : {}),
          timeline: [{ at: at(rtoAd, 12), by: handler.name, stage: 'IN_TRANSIT' as const, note: `Delivery failed (${reason}). Parcel is coming back to the warehouse.` },
            ...(backAd ? [{ at: at(backAd, 15), by: handler.name, stage: 'CLOSED' as const, note: `Received in-house: ${lines.map((l) => `${l.quantity}× ${l.productName}`).join(', ')}. Back to stock.` }] : [])],
          createdAt: at(rtoAd, 12),
        }));
      }
      failures.push(add<DeliveryFailure>('deliveryFailures', {
        id: `sample_df_${failures.length + 1}`, orderId: order.id, orderNumber: order.orderNumber, brandCode: brand, customerName: sim.name, customerPhone: sim.phone,
        productName: items.map((i) => `${i.quantity}× ${i.productName}`).join(', '), deliveryMethod: order.deliveryMethod, dateAd: failedAd, dateBs: bs(failedAd), reason,
        valley: sim.place.valley, attempts: recovered ? 2 : 1, address: sim.address, district: sim.place.district, platform: order.platform, orderDateAd: dateAd,
        products: items.map((i) => ({ productName: i.productName, quantity: i.quantity })),
        attemptLog: [{ attempt: 1, dateAd: failedAd, dateBs: bs(failedAd), reason, loggedAt: at(failedAd, 17), loggedBy: handler.name }] as DeliveryFailure['attemptLog'],
        status: recovered ? 'DELIVERED' : rto ? 'RETURNED_TO_WAREHOUSE' : recent && chance(0.5) ? 'REATTEMPT_SCHEDULED' : 'FAILED',
        ...(rto ? { rtoDateAd: rtoAd } : {}),
        ...(recent ? { reattemptDateAd: addDays(today, 1), reattemptDateBs: bs(addDays(today, 1)) } : {}),
        assignedTo: handler.name, createdAt: at(failedAd, 17),
      }));
    }
    if (status === 'RETURNED') {
      const line = items[0];
      const returnedAd = addDays(delivered!, between(1, 4));
      const recent = offset <= 12;
      const status = recent && chance(0.5) ? 'Pending' : pick(['Returned', 'Refunded', 'Refunded'] as const);
      // Tracked as a ticket: an open one is on its way back or waiting for pickup; a settled one was checked in.
      const stage: TicketStage = status === 'Pending' ? pick(['OPEN', 'PICKUP_ARRANGED', 'IN_TRANSIT'] as const) : recent ? 'RESOLVED' : 'CLOSED';
      const backAd = stage === 'CLOSED' || (stage === 'RESOLVED' && chance(0.5)) ? addDays(returnedAd, between(1, 3)) : undefined;
      const amount = line.totalPrice;
      returns.push(add<ReturnEntry>('returns', {
        id: `sample_return_${returns.length + 1}`, orderId: order.id, orderNumber: order.orderNumber, brandCode: brand, productId: line.productId, productName: line.productName,
        customerName: sim.name, customerPhone: sim.phone, dateAd: returnedAd, dateBs: bs(returnedAd), orderProcessedDateAd: dateAd, orderProcessedDateBs: bs(dateAd),
        platform: order.platform, quantity: line.quantity, reasonCategory: weighted(RETURN_REASONS), orderStatus: status,
        valley: sim.place.valley, issueCategories: [], resolvedDateAd: status === 'Pending' ? undefined : addDays(returnedAd, 2), createdAt: at(returnedAd, 14),
        ticketType: 'RETURN', stage, expectGoodsBack: true,
        lines: [{ productId: line.productId, productName: line.productName, brandCode: line.brandCode, kind: 'BACK', quantity: line.quantity, ...(backAd ? { receivedQty: line.quantity, condition: chance(0.7) ? 'GOOD' as const : 'DAMAGED' as const } : {}) }],
        ...(stage === 'PICKUP_ARRANGED' || stage === 'IN_TRANSIT' ? { courier: order.deliveryMethod, pickupDateAd: addDays(returnedAd, 1) } : {}),
        ...(backAd ? { receivedDateAd: backAd, receivedBy: handler.name } : {}),
        ...(status !== 'Pending' ? { resolution: { type: status === 'Refunded' ? 'REFUND' as const : 'STORE_CREDIT' as const, ...(status === 'Refunded' ? { amount } : {}), dateAd: addDays(returnedAd, 2), by: handler.name } } : {}),
        timeline: [{ at: at(returnedAd, 14), by: handler.name, stage: 'OPEN' as const, note: `Return logged: ${line.quantity}× ${line.productName}.` },
          ...(backAd ? [{ at: at(backAd, 16), by: handler.name, stage: 'RECEIVED' as const, note: `Received in-house: ${line.quantity}× ${line.productName}.` }] : []),
          ...(status !== 'Pending' ? [{ at: at(addDays(returnedAd, 2), 11), by: handler.name, stage: stage, note: `Resolved: ${status === 'Refunded' ? `Refund (NPR ${amount.toLocaleString()})` : 'Store credit'}.` }] : [])],
      }));
    }
    // Packing errors: a unit short, or the wrong product in the box. They are our mistakes, not customer returns.
    if (status === 'DELIVERED' && offset > 4 && chance(0.05)) {
      const short = items.some((i) => i.quantity > 1) && chance(0.5);
      const reportedAd = addDays(delivered!, 1);
      const settled = offset > 15;
      const packer = pick(desk.length ? desk : [manager]);
      const right = short ? items.find((i) => i.quantity > 1)! : items[0];
      const wrongProduct = range.find((p) => !items.some((i) => i.productId === p.id)) || products.find((p) => p.id !== right.productId && !p.isCombo);
      const lines = short
        ? [{ productId: right.productId, productName: right.productName, brandCode: right.brandCode, kind: 'MISSING' as const, quantity: 1 }]
        : [...(wrongProduct ? [{ productId: wrongProduct.id, productName: wrongProduct.name, brandCode: wrongProduct.brandCode, kind: 'SENT_WRONG' as const, quantity: 1, ...(settled ? { receivedQty: 1, condition: 'GOOD' as const } : {}) }] : []),
          { productId: right.productId, productName: right.productName, brandCode: right.brandCode, kind: 'SHOULD_HAVE_SENT' as const, quantity: 1 }];
      const wrong = !short && !!wrongProduct;
      returns.push(add<ReturnEntry>('returns', {
        id: `sample_pack_${returns.length + 1}`, orderId: order.id, orderNumber: order.orderNumber, brandCode: brand, productId: right.productId, productName: right.productName,
        customerName: sim.name, customerPhone: sim.phone, dateAd: reportedAd, dateBs: bs(reportedAd), orderProcessedDateAd: dateAd, orderProcessedDateBs: bs(dateAd),
        platform: order.platform, quantity: 1, reasonCategory: wrong ? 'Wrong item packed' : 'Short shipped', orderStatus: settled ? 'Returned' : 'Pending',
        valley: sim.place.valley, issueCategories: [], createdAt: at(reportedAd, 12),
        ticketType: wrong ? 'WRONG_ITEM' : 'SHORT_SHIPPED', stage: settled ? 'CLOSED' : 'OPEN', lines, expectGoodsBack: wrong, fault: 'PACKING', packedBy: packer.name,
        ...(settled ? { resolution: { type: 'RESEND' as const, dateAd: addDays(reportedAd, 1), by: packer.name }, resolvedDateAd: addDays(reportedAd, 1), ...(wrong ? { receivedDateAd: addDays(reportedAd, 3), receivedBy: packer.name } : {}) } : {}),
        timeline: [{ at: at(reportedAd, 12), by: handler.name, stage: 'OPEN' as const, note: wrong ? `Wrong item logged. Sent ${wrongProduct!.name} instead of ${right.productName}.` : `Short shipped logged. 1× ${right.productName} missing from the parcel.` }],
      }));
    }
    return order;
  };

  for (const sim of sims) {
    const count = sim.habit === 'once' ? 1 : sim.habit === 'twice' ? 2 : sim.habit === 'regular' ? between(3, 4) : sim.habit === 'loyal' ? between(5, 7) : between(2, 4);
    let offset = sim.start;
    for (let n = 0; n < count && offset >= 0; n += 1) {
      makeOrder(sim, offset, n === 0);
      offset -= sim.habit === 'loyal' ? between(12, 22) : between(18, 40);
    }
  }
  // The last ten days are busy, so today's desk work (new orders, dispatches, follow-up calls) is full:
  // a mix of returning customers and first-timers every day.
  for (let offset = 9; offset >= 0; offset -= 1) {
    const count = between(4, 7);
    for (let n = 0; n < count; n += 1) {
      const returning = sims.filter((s) => s.orders.length && s.orders[s.orders.length - 1].orderDateAd < addDays(today, -offset - 10));
      let sim = chance(0.4) && returning.length ? pick(returning) : undefined;
      if (!sim) {
        const i = sims.length;
        const place = PLACES[between(0, PLACES.length - 1)];
        sim = { id: `sample_cust_${i + 1}`, name: `${FIRST[(i * 3) % FIRST.length]} ${LAST[(i * 11) % LAST.length]}`, phone: `9700${String(100000 + i * 137).slice(0, 6)}`,
          place, address: `${place.area}, ${place.city}`, brand: weighted(brandWeights), orders: [], habit: 'once', start: offset };
        sims.push(sim);
      }
      makeOrder(sim, offset, !sim.orders.length);
    }
  }

  // Customer calls: planned follow-ups (from the follow-up start date) and everyday calls --------
  const calls: CustomerCall[] = [];
  const call = (order: Order, dateAd: string, purpose: string, outcome: CustomerCallOutcome, extra: Partial<CustomerCall> = {}) => {
    const who = desk[calls.length % desk.length] || manager;
    calls.push(add<CustomerCall>('customerCalls', {
      id: `sample_ccall_${calls.length + 1}`, orderId: order.id, orderNumber: order.orderNumber, brandCode: order.brandCode, customerName: order.customerName, customerPhone: order.customerPhone,
      purpose, outcome, durationMinutes: outcome === 'NO_ANSWER' || outcome === 'SWITCHED_OFF' ? 0 : between(1, 6), officerId: who.id, officerName: who.name,
      dateAd, dateBs: bs(dateAd), createdAt: at(dateAd, between(10, 18), between(0, 59)), ...extra,
    }));
  };
  const plan = DEFAULT_FOLLOW_UP_PLAN;
  for (const order of orders) {
    if (order.orderDateAd < plan.startFromAd || order.status === 'CANCELLED') continue;
    for (const step of plan.steps) {
      const due = addDays(step.from === 'DELIVERY' ? order.deliveredDateAd || '9999-12-31' : order.orderDateAd, step.daysAfter);
      if (due >= today || chance(0.25)) continue; // left for the team to do
      const followUp = { followUpStepId: step.id, followUpStepLabel: step.label };
      const roll = random();
      if (roll < 0.2) {
        call(order, due, 'Follow-up', 'NO_ANSWER', followUp);
        if (addDays(due, 1) < today && chance(0.6)) call(order, addDays(due, 1), 'Follow-up', chance(0.5) ? 'HAPPY' : 'SWITCHED_OFF', followUp);
      } else if (roll < 0.28) call(order, due, 'Follow-up', 'CALL_BACK', { ...followUp, callbackDateAd: today, notes: 'Asked to call after office hours.' });
      else if (roll < 0.36) call(order, due, 'Follow-up', 'ISSUE', { ...followUp, notes: 'Box was dented; product fine. Offered a replacement if anything leaks.' });
      else if (roll < 0.42) call(order, due, 'Follow-up', 'REORDER', { ...followUp, notes: 'Wants the same again next week.' });
      else call(order, due, 'Follow-up', 'HAPPY', followUp);
    }
  }
  for (const order of orders.filter((o) => o.orderDateAd < plan.startFromAd)) {
    if (order.status === 'FAILED' && chance(0.8)) call(order, addDays(order.orderDateAd, 3), 'Delivery update', chance(0.5) ? 'NO_ANSWER' : 'SPOKE', { notes: 'Courier could not reach the customer.' });
    else if (order.status === 'RETURNED') call(order, addDays(order.deliveredDateAd || order.orderDateAd, 2), 'Return or exchange', 'SPOKE', { notes: 'Arranged pickup for the return.' });
    else if (order.paymentTerms === 'COD' && chance(0.1)) call(order, order.orderDateAd, 'Order confirmation', 'SPOKE');
  }
  const wrong = orders.find((o) => o.status === 'FAILED');
  if (wrong) call(wrong, addDays(wrong.orderDateAd, 2), 'Delivery update', 'WRONG_NUMBER', { notes: 'Number belongs to someone else.' });

  // Reviews and complaints from real (test) customers, with star ratings --------------------------
  const delivered = orders.filter((o) => o.status === 'DELIVERED' && o.deliveredDateAd! < today);
  const voices: [FeedbackEntry['type'], 1 | 2 | 3 | 4 | 5, string][] = [
    ['REVIEW', 5, 'Exactly as shown, will order again.'], ['REVIEW', 5, 'Fast delivery and the packing was neat.'], ['REVIEW', 4, 'Good product, a little pricey.'],
    ['REVIEW', 5, 'My second order, love it.'], ['FEEDBACK', 3, 'It is okay, expected a bit more.'], ['REVIEW', 4, 'Nice, the short name on the bill confused me though.'],
    ['COMPLAINT', 2, 'Delivered a day late and the rider did not call first.'], ['COMPLAINT', 1, 'Wrong shade sent, I ordered the other one.'],
    ['REVIEW', 5, 'Works well, recommended to my sister.'], ['FEEDBACK', 3, 'Delivery charge outside the valley is high.'], ['COMPLAINT', 2, 'Seal was open when it arrived.'],
    ['REVIEW', 4, 'Good value with the discount.'], ['REVIEW', 5, 'Best one I have tried.'], ['COMPLAINT', 1, 'Got a rash after use, want to return.'],
    ['REVIEW', 5, 'Ordered for my mother, she is happy.'], ['FEEDBACK', 4, 'Please bring a bigger pack.'],
  ];
  const feedback: FeedbackEntry[] = [];
  voices.forEach(([type, rating, text], index) => {
    // Complaints come from the last few weeks, so some are still open; reviews come from any time.
    const pool = type === 'COMPLAINT' ? delivered.filter((o) => o.orderDateAd >= addDays(today, -25)) : delivered;
    const order = (pool.length ? pool : delivered)[(index * 11) % Math.max(1, (pool.length ? pool : delivered).length)];
    if (!order) return;
    const line = order.items[0];
    const dateAd = addDays(order.deliveredDateAd!, between(1, 6)) < today ? addDays(order.deliveredDateAd!, between(1, 6)) : order.deliveredDateAd!;
    const complaint = type === 'COMPLAINT';
    const status = complaint ? (addDays(dateAd, 7) < today ? 'RESOLVED' : pick(['OPEN', 'IN_PROGRESS'] as const)) : undefined;
    feedback.push(add<FeedbackEntry>('feedbackEntries', {
      id: `sample_fb_online_${index + 1}`, customerName: order.customerName, customerPhone: order.customerPhone, customerLink: 'LINKED', brandCode: order.brandCode,
      productId: line.productId, productName: line.productName, type, channel: pick(['Instagram DM', 'WhatsApp', 'Website review', 'Follow-up call']), orderId: order.id, orderNumber: order.orderNumber,
      dateReceivedAd: dateAd, dateReceivedBs: bs(dateAd), fullText: text, screenshotUrls: [], issueCategories: complaint ? [pick(['Late delivery', 'Wrong item sent', 'Damaged packaging', 'Skin irritation'])] : [],
      sentiment: rating >= 4 ? 'POSITIVE' : rating === 3 ? 'NEUTRAL' : 'NEGATIVE', rating, hasScreenshot: false, usedInDesign: rating === 5 && chance(0.4), postedOnWebsite: rating === 5 && chance(0.5),
      priority: complaint ? (rating === 1 ? 'HIGH' : 'MEDIUM') : undefined, assignedTo: complaint ? manager.id : undefined, assignedToName: complaint ? manager.name : undefined,
      complaintStatus: status, resolutionNotes: status === 'RESOLVED' ? 'Replacement sent; customer confirmed on a call.' : undefined, history: [], createdAt: at(dateAd, between(10, 20)),
    }));
  });

  // Customer records whose totals agree with their orders ----------------------------------------
  for (const sim of sims) {
    if (!sim.orders.length) continue;
    const mine = sim.orders;
    const count = (status: Order['status']) => mine.filter((o) => o.status === status).length;
    const deliveredCount = count('DELIVERED') + count('RETURNED');
    const failed = count('FAILED'), cancelled = count('CANCELLED'), returned = count('RETURNED');
    const complaints = feedback.filter((f) => f.customerPhone === sim.phone && f.type === 'COMPLAINT').length;
    const reviews = feedback.filter((f) => f.customerPhone === sim.phone && f.type === 'REVIEW').length;
    const karma = Math.max(0, Math.min(100, 70 + mine.length * 2 + deliveredCount + mine.filter((o) => o.paymentTerms === 'Prepaid').length + reviews * 3
      - returned * 3 - failed * 5 - cancelled * 5 - complaints * 2 + (deliveredCount >= 5 && !returned && !failed ? 10 : 0)));
    const dates = mine.map((o) => o.orderDateAd).sort();
    add<Customer>('customers', {
      id: sim.id, phone: sim.phone, name: sim.name, city: sim.place.city, province: sim.place.province, firstOrderDate: dates[0], lastOrderDate: dates[dates.length - 1],
      totalOrders: mine.length, totalDelivered: deliveredCount, totalReturns: returned, totalDeliveryFailures: failed, totalCancellations: cancelled, totalComplaints: complaints, totalReviews: reviews,
      karmaScore: karma, segment: calculateCustomerSegment(karma, mine.length, deliveredCount, returned), activeFlags: evaluateCustomerFlags(returned, failed, cancelled),
      brandsPurchased: [...new Set(mine.map((o) => o.brandCode))],
    });
  }

  // A few notifications for the person loading the data, so the bell and messages can be tried.
  const note = (index: number, data: Omit<Notification, 'id' | 'userId' | 'read' | 'createdAt'>, minutesAgo: number) => add<Notification>('notifications', {
    // Yesterday evening, so they wait unread in the bell instead of popping up the moment the data loads.
    id: `sample_note_${index}`, userId: manager.id, read: false, createdAt: new Date(Date.parse(at(addDays(today, -1), 19)) - minutesAgo * 60000).toISOString(), ...data,
  });
  const sender = desk[0] || manager;
  note(1, { kind: 'MESSAGE', title: 'Courier pickup moved', message: 'Pathao pickup is at 4 pm today instead of 2 pm. Please keep the parcels packed by 3:30.', priority: 'MEDIUM', senderId: sender.id, senderName: sender.name, event: 'message' }, 40);
  const failure = failures.find((f) => f.status === 'FAILED');
  if (failure) note(2, { kind: 'EVENT', title: 'Delivery failed', message: `${failure.orderNumber} for ${failure.customerName}: ${failure.reason}.`, priority: 'HIGH', entityType: 'orders', entityId: failure.orderId, link: `/orderflow/orders/${failure.orderId}`, event: 'delivery_failed' }, 90);
  const complaint = feedback.find((f) => f.type === 'COMPLAINT' && f.complaintStatus !== 'RESOLVED');
  if (complaint) note(3, { kind: 'EVENT', title: 'New complaint', message: `${complaint.customerName} on ${complaint.productName}: “${complaint.fullText}”`, priority: 'HIGH', entityType: 'feedbackEntries', entityId: complaint.id, link: '/reviews/feedback', event: 'complaint_new' }, 180);

  return { orders, calls, failures, returns, feedback };
}
