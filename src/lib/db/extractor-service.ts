import { createHash } from 'node:crypto';
import type { DatabaseService } from './db-service';
import type { Order, OrderItem } from '../types';
import { canAccessBrand, canPerform, isSuperAdmin } from '../permissions';
import { applyAddOn, findAddOnTarget, itemSummary } from '../order-merge';
import { priceTrail } from '../order-pricing';
import { offerUsageFrom } from '../offers';

/** An add-on's offers and customer discount join the order's own. */
function mergePriceFields(target: Partial<Order>, added: Partial<Order>): Partial<Order> {
  const offers = [...(target.appliedOffers || [])];
  for (const entry of added.appliedOffers || []) {
    const same = offers.find(item => item.offerId === entry.offerId);
    if (same) Object.assign(same, { amount: money(same.amount + entry.amount), ...(entry.giftQuantity ? { giftQuantity: (same.giftQuantity || 0) + entry.giftQuantity, giftValue: money((same.giftValue || 0) + (entry.giftValue || 0)) } : {}) });
    else offers.push({ ...entry });
  }
  const customer = money((target.customerDiscount || 0) + (added.customerDiscount || 0));
  return { ...(offers.length ? { appliedOffers: offers, campaignIds: [...new Set(offers.map(item => item.campaignId))] } : {}),
    ...(customer > 0 ? { customerDiscount: customer } : {}), ...(added.customerDiscountReason && !target.customerDiscountReason ? { customerDiscountReason: added.customerDiscountReason } : {}) };
}
import { normalizePhoneNumber } from '../auth-utils';
import { isSellableCombo } from '../product-catalog';
import { activeOrderOptionNames } from '../order-options';
import { adToBs } from '../nepali-calendar';
import { allocateOrderTotal } from '../extractor-export';

export class ExtractorInputError extends Error { constructor(message: string, public status = 400) { super(message); } }
const required = (value: unknown, label: string, max = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new ExtractorInputError(`${label} is required (maximum ${max} characters).`);
  return value.trim();
};
const optional = (value: unknown, label: string, max = 200) => value == null || typeof value === 'string' && !value.trim() ? '' : required(value, label, max);
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export async function saveExtractedOrders(input: any, workspace: { db: DatabaseService; commit(): Promise<void | Record<string, string>>; allOrders?: () => Order[] }) {
  if (!Array.isArray(input?.orders) || input.orders.length < 1 || input.orders.length > 50) throw new ExtractorInputError('Save between 1 and 50 orders at a time.');
  const { db } = workspace; const actor = db.getCurrentUser(); const seen = new Set<string>();
  type NewOrder = Omit<Order, 'id' | 'createdAt'> & { id: string };
  const created: NewOrder[] = [];
  // Per message: the order it saved into (new, existing, or already saved earlier).
  const results: { orderId: string; orderNumber: string; alreadySaved: boolean; addedTo?: string }[] = [];
  const now = new Date().toISOString();
  for (const [index, row] of (input.orders as any[]).entries()) {
    const label = `Order ${index + 1}`;
    const kind: 'ORDER' | 'ADD_ON' | 'EXCHANGE' = row?.entryKind === 'ADD_ON' || row?.entryKind === 'EXCHANGE' ? row.entryKind : 'ORDER';
    const clientId = required(row?.clientId, `${label} identifier`, 100);
    if (!/^ext_[a-z0-9_-]{8,90}$/i.test(clientId) || seen.has(clientId)) throw new ExtractorInputError(`${label} has an invalid or duplicate identifier.`);
    seen.add(clientId);
    const orderNumber = `BB-WA-${clientId.slice(4).toUpperCase()}`;
    const requestHash = createHash('sha256').update(JSON.stringify(row)).digest('hex');
    // The extractor's own reference is kept as the legacy ID; the server gives the order its short ID.
    const existing = db.getOrders().find(order => order.legacyOrderNumber === orderNumber || order.orderNumber === orderNumber);
    if (existing) {
      if (existing.extractorRequestHash !== requestHash) throw new ExtractorInputError(`${label} was already saved with different details.`, 409);
      results.push({ orderId: existing.id, orderNumber: existing.orderNumber, alreadySaved: true }); continue;
    }
    // An "order added" message saved before lives inside the order it was added to.
    const mergedInto = [...db.getOrders(), ...created].find(order => order.extractorAddOns?.some(entry => entry.clientId === clientId));
    if (mergedInto) {
      if (!mergedInto.extractorAddOns!.some(entry => entry.clientId === clientId && entry.hash === requestHash)) throw new ExtractorInputError(`${label} was already added to ${mergedInto.orderNumber} with different details.`, 409);
      results.push({ orderId: mergedInto.id, orderNumber: mergedInto.orderNumber, alreadySaved: true, addedTo: mergedInto.orderNumber }); continue;
    }
    const customerName = required(row.customerName, `${label} customer name`);
    const customerPhone = normalizePhoneNumber(required(row.customerPhone, `${label} phone`));
    if (!/^9[678]\d{8}$/.test(customerPhone)) throw new ExtractorInputError(`${label} needs a valid Nepal mobile number.`);
    if (db.getCustomers().filter(customer => normalizePhoneNumber(customer.phone) === customerPhone).length > 1) throw new ExtractorInputError(`${label} matches duplicate customer profiles. Resolve them before saving.`, 409);
    if (row.isMarketing) throw new ExtractorInputError('Marketing sends are created from the influencer profile. The extractor saves customer orders only.');
    const alternatePhone = row.alternatePhone ? normalizePhoneNumber(required(row.alternatePhone, `${label} alternate phone`)) : '';
    if (alternatePhone && !/^9[678]\d{8}$/.test(alternatePhone)) throw new ExtractorInputError(`${label} alternate phone is invalid.`);
    const province = optional(row.province, `${label} province`), district = optional(row.city, `${label} city`), address = required(row.address, `${label} address`, 500);
    const orderDateAd = required(row.orderDateAd, `${label} date`, 10);
    const date = new Date(`${orderDateAd}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDateAd) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== orderDateAd) throw new ExtractorInputError(`${label} date is invalid.`);
    const platform = required(row.platform, `${label} sales channel`, 100), deliveryMethod = required(row.deliveryMethod, `${label} logistics`, 100);
    if (!activeOrderOptionNames(db.getOrderOptions(),'channels').includes(platform) || !activeOrderOptionNames(db.getOrderOptions(),'deliveryMethods').includes(deliveryMethod)) throw new ExtractorInputError(`${label} needs an active sales channel and logistics option.`);
    if (!['COD','Prepaid'].includes(row.paymentTerms)) throw new ExtractorInputError(`${label} payment must be COD or Prepaid.`);
    if (!Array.isArray(row.items) || row.items.length === 0 || row.items.length > 50) throw new ExtractorInputError(`${label} needs catalogue items.`);
    const products = db.getProducts(), combos = db.getCombos();
    const items: { productId: string; productName: string; brandCode: string; quantity: number; unitPrice: number; totalPrice: number; catalogUnitPrice: number; written: boolean }[] = (row.items as any[]).map((item: any) => {
      if (!item || typeof item.productId !== 'string' || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000) throw new ExtractorInputError(`${label} has an invalid item quantity.`);
      const product = products.find(candidate => candidate.id === item.productId && candidate.active !== false);
      const combo = combos.find(candidate => candidate.id === item.productId && isSellableCombo(candidate, products));
      const selected = product || combo; if (!selected || !canAccessBrand(actor, selected.brandCode)) throw new ExtractorInputError(`${label} contains an unavailable item. Refresh and extract again.`, 409);
      const price = product ? product.mrp : combo!.comboPrice || combo!.comboMrp || 0;
      if (!Number.isFinite(price) || price <= 0 || typeof item.expectedUnitPrice !== 'number' || !Number.isFinite(item.expectedUnitPrice) || Math.abs(item.expectedUnitPrice - price) > 0.005) throw new ExtractorInputError(`${label} has a changed or invalid catalogue price. Refresh and extract again.`, 409);
      const salePrice = item.saleUnitPrice == null ? price : item.saleUnitPrice;
      if (typeof salePrice !== 'number' || !Number.isFinite(salePrice) || salePrice < 0 || salePrice > price || Math.abs(salePrice * 100 - Math.round(salePrice * 100)) > 1e-6) throw new ExtractorInputError(`${label} item selling price must be between zero and the catalogue price.`);
      return { productId: selected.id, productName: selected.name, brandCode: selected.brandCode, quantity: item.quantity, catalogUnitPrice: price, unitPrice: salePrice, totalPrice: money(salePrice * item.quantity), written: item.saleUnitPrice != null };
    });
    if (new Set(items.map(item => item.brandCode)).size !== 1) throw new ExtractorInputError(`${label} contains multiple brands; split it into separate orders.`);
    const brandCode = items[0].brandCode;
    if (!db.getBrands('ACTIVE').some(brand => brand.code === brandCode)) throw new ExtractorInputError(`${label} brand is no longer active.`, 409);
    const catalogCents = items.reduce((sum,item) => sum + Math.round(item.totalPrice * 100), 0);
    if (!Number.isSafeInteger(catalogCents) || catalogCents < 0) throw new ExtractorInputError(`${label} item total is too large.`);
    const stated = row.statedPrice == null ? null : Number(row.statedPrice);
    const discount = row.discountPercent == null ? null : Number(row.discountPercent);
    if (stated !== null && (!Number.isFinite(stated) || stated < 0 || Math.abs(stated * 100 - Math.round(stated * 100)) > 1e-6 || !Number.isSafeInteger(Math.round(stated * 100)) || stated * 100 > catalogCents + 0.5)) throw new ExtractorInputError(`${label} stated amount cannot exceed the item selling prices.`);
    if (discount !== null && (!Number.isFinite(discount) || discount < 0 || discount > 100 || Math.abs(discount * 100 - Math.round(discount * 100)) > 1e-6)) throw new ExtractorInputError(`${label} discount must be between 0 and 100%.`);
    if (kind === 'EXCHANGE' && discount !== null) throw new ExtractorInputError(`${label} is an exchange: enter the amount to collect instead of a percentage.`);
    // Price trail: catalogue MRP → live sales and offers → what staff wrote → net. The server prices with its
    // own copy of the sales, so a browser can never invent an offer.
    const orderTime = typeof row.orderTime === 'string' && /^\d{2}:\d{2}$/.test(row.orderTime) ? row.orderTime : undefined;
    const disabledOfferIds = Array.isArray(row.disabledOfferIds) ? row.disabledOfferIds.filter((id: unknown): id is string => typeof id === 'string').slice(0, 50) : [];
    const messageText = typeof row.messageText === 'string' ? row.messageText.slice(0, 5000) : '';
    const everyOrder = [...(workspace.allOrders?.() || db.getOrders('ALL')), ...created.map(order => ({ ...order, createdAt: now } as Order))];
    const ownOrders = everyOrder.filter(order => normalizePhoneNumber(order.customerPhone) === customerPhone && order.status !== 'CANCELLED' && !order.exchangeRequested && !order.exchangeReturnId);
    const catalogue = { name: (id: string) => products.find(entry => entry.id === id)?.name || combos.find(entry => entry.id === id)?.name,
      price: (id: string) => { const product = products.find(entry => entry.id === id && entry.active !== false && entry.brandCode === brandCode); return product ? product.mrp : undefined; } };
    const trail = priceTrail({ kind, stated, percent: discount,
      lines: items.map(item => ({ itemId: item.productId, name: item.productName, quantity: item.quantity, mrp: item.catalogUnitPrice, isCombo: combos.some(entry => entry.id === item.productId),
        category: products.find(entry => entry.id === item.productId)?.category, ...(item.written ? { writtenUnitPrice: item.unitPrice } : {}) })),
      offers: { brandCode, channel: platform, dateAd: orderDateAd, time: orderTime, customerPhone, isFirstOrder: !ownOrders.length, text: messageText,
        campaigns: db.getCampaigns(), disabledOfferIds, usage: offerUsageFrom(everyOrder, customerPhone), catalogue } });
    if (trail.problem) throw new ExtractorInputError(`${label}: ${trail.problem}`, 409);
    if (typeof row.expectedTotal === 'number' && Math.abs(row.expectedTotal - trail.total) > 0.005) {
      const applied = (trail.pricing?.applied || []).map(entry => entry.offerName);
      throw new ExtractorInputError(`${label}: the sales or offers changed since this order was extracted. It now comes to NPR ${trail.total.toLocaleString()}${applied.length ? ` with ${applied.join(' + ')}` : ' with no offer'}. Extract it again, or switch off an offer that has already been used up.`, 409);
    }
    const adjusted: OrderItem[] = items.map((item, i) => {
      const line = trail.lines[i];
      return { productId: item.productId, productName: item.productName, brandCode: item.brandCode, quantity: item.quantity, catalogUnitPrice: item.catalogUnitPrice,
        totalPrice: line.total, unitPrice: money(line.total / item.quantity),
        ...(kind === 'EXCHANGE' ? {} : { discountAmount: money(item.catalogUnitPrice * item.quantity - line.total),
          ...(line.offerDiscount > 0 ? { offerUnitPrice: money(line.offerTotal / item.quantity), offerDiscount: line.offerDiscount } : {}),
          ...(line.customerDiscount > 0 ? { customerDiscount: line.customerDiscount } : {}) }) };
    });
    for (const gift of trail.pricing?.gifts || []) {
      adjusted.push({ productId: gift.itemId, productName: gift.name, brandCode, quantity: gift.quantity, unitPrice: 0, totalPrice: 0, catalogUnitPrice: gift.mrp, isGift: true, giftOfferId: gift.offerId });
    }
    const total = trail.total;
    const applied = trail.pricing?.applied || [];
    const reason = typeof row.customerDiscountReason === 'string' ? row.customerDiscountReason.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120) : '';
    const priceFields = { ...(orderTime ? { orderTime } : {}), ...(applied.length ? { appliedOffers: applied, campaignIds: trail.pricing!.campaignIds } : {}),
      ...(trail.customerDiscount > 0 ? { customerDiscount: trail.customerDiscount, ...(reason ? { customerDiscountReason: reason } : {}) } : {}) };

    if (kind === 'ADD_ON') {
      // The customer added to today's order: the items join that order instead of making a new one.
      const candidates = [...created.map(order => ({ ...order, createdAt: now } as Order)), ...db.getOrders()];
      const found = findAddOnTarget(candidates, { phone: customerPhone, dateAd: orderDateAd, brandCode });
      if (!found.order) throw new ExtractorInputError(`${label}: ${found.problem}`, 409);
      const target = created.find(order => order.id === found.order!.id) || db.getOrderById(found.order.id)!;
      const merged = { ...applyAddOn(target, { items: adjusted, total, discountPercent: discount }), ...mergePriceFields(target, priceFields) };
      const addOns = [...(target.extractorAddOns || []), { clientId, hash: requestHash, addedAt: now, total }];
      const note = `Order added ${orderDateAd}: ${itemSummary(adjusted)} (NPR ${total.toLocaleString()}).`;
      const notes = [target.notes, note].filter(Boolean).join(' ');
      if (created.includes(target as NewOrder)) {
        Object.assign(target, merged, { extractorAddOns: addOns, notes });
        if (merged.statedPrice === undefined) delete (target as Partial<Order>).statedPrice;
        if (merged.discountPercent === undefined) delete (target as Partial<Order>).discountPercent;
      } else {
        if (!isSuperAdmin(actor) && !canPerform(actor, 'orderflow', 'EDIT')) throw new ExtractorInputError(`${label}: adding items to ${target.orderNumber} needs OrderFlow edit access. Ask an admin, or save it as a new order.`, 403);
        db.updateOrder(target.id, { ...merged, extractorAddOns: addOns, notes }, undefined, note);
      }
      results.push({ orderId: target.id, orderNumber: target.orderNumber, alreadySaved: false, addedTo: target.orderNumber });
      continue;
    }

    const bs = adToBs(date);
    // A fixed record ID per extracted message means a double submit can never save the order twice.
    const order: NewOrder = { id: `ord_${clientId}`, orderNumber, extractorRequestHash: requestHash, brandCode, orderDateAd, orderDateBs: `${bs.monthName} ${bs.day}, ${bs.year}`,
      platform, customerName, customerPhone, ...(alternatePhone ? { alternatePhone } : {}), province, district, address, deliveryMethod, ...(row.assignedToId ? { assignedToId: required(row.assignedToId, `${label} responsible person`) } : {}),
      paymentTerms: row.paymentTerms, orderType: kind === 'EXCHANGE' ? 'REPEAT' : 'NEW', items: adjusted, totalAmount: total,
      ...(stated !== null ? { statedPrice: stated } : {}), ...(discount !== null ? { discountPercent: discount } : {}), ...priceFields, status: 'PENDING', source: 'WHATSAPP_EXTRACTOR',
      ...(kind === 'EXCHANGE' ? { exchangeRequested: true, notes: `Exchange from WhatsApp (NPR ${total.toLocaleString()} to collect). Link it to the return when the return is logged.` } : { notes: 'Extracted and reviewed from WhatsApp.' }) };
    created.push(order);
    results.push({ orderId: order.id, orderNumber, alreadySaved: false });
  }
  for (const order of created) db.addOrder(order);
  const changed = created.length > 0 || results.some(entry => entry.addedTo && !entry.alreadySaved);
  const assigned = changed ? await workspace.commit() || {} : {};
  const numberOf = (entry: typeof results[number]) => assigned[entry.orderId] || entry.orderNumber;
  return {
    orderNumbers: results.map(numberOf),
    addedTo: results.map(entry => entry.addedTo ? numberOf(entry) : null),
    alreadySaved: results.filter(entry => entry.alreadySaved).length,
  };
}
