import type { DeliveryFailure, Order, ReturnEntry, SaleCampaign } from './types';
import { lineMoney } from './monthly-sales-report';

/**
 * How a sale did: the sale period against the same number of days just before it (and just after, once
 * that has passed), for the brands and channels the sale covered.
 */
export interface PeriodStats {
  from: string; to: string; days: number;
  orders: number; units: number; netCents: number; mrpCents: number; offerCents: number; customerCents: number;
  giftUnits: number; giftCents: number;
  perDayOrders: number; perDayNetCents: number; averageOrderCents: number;
  comboUnits: number; singleUnits: number; comboNetCents: number; singleNetCents: number;
  newCustomers: number; returningCustomers: number;
  failed: number; returned: number;
  channels: { channel: string; orders: number; netCents: number }[];
}
export interface OfferResult { offerId: string; offerName: string; orders: number; discountCents: number; netCents: number; giftUnits: number; giftCents: number; nearThreshold: number }
export interface SaleResults {
  during: PeriodStats; before: PeriodStats; after: PeriodStats | null;
  /** Change per day against the days before the sale (%). */
  lift: { orders: number | null; net: number | null; averageOrder: number | null };
  /** Net sales above the days before, minus what the discounts and gifts cost. */
  extraNetCents: number; discountCostCents: number;
  offers: OfferResult[];
  /** Orders the sale actually priced vs orders in the same days it did not touch. */
  pricedOrders: number; unpricedOrders: number;
  saleFailureRate: number | null; otherFailureRate: number | null; saleReturnRate: number | null; otherReturnRate: number | null;
}

const DAY = 86400000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const span = (from: string, to: string) => Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1);
const pct = (now: number, then: number) => then > 0 ? Math.round(((now - then) / then) * 1000) / 10 : null;
const rate = (part: number, whole: number) => whole ? Math.round((part / whole) * 1000) / 10 : null;
const digits = (phone: string) => String(phone || '').replace(/\D/g, '').slice(-10);

export function inSaleScope(order: Order, campaign: Pick<SaleCampaign, 'brandCodes' | 'channels'>): boolean {
  if (order.isMarketing || order.exchangeReturnId || order.exchangeRequested || order.status === 'CANCELLED') return false;
  if (campaign.brandCodes.length && !campaign.brandCodes.includes(order.brandCode)) return false;
  if (campaign.channels.length && !campaign.channels.some((name) => name.toLowerCase() === String(order.platform || '').toLowerCase())) return false;
  return true;
}

function stats(orders: Order[], all: Order[], from: string, to: string, failures: DeliveryFailure[], returns: ReturnEntry[], comboIds: Set<string>): PeriodStats {
  const inside = orders.filter((order) => order.orderDateAd >= from && order.orderDateAd <= to);
  const days = span(from, to);
  const result: PeriodStats = { from, to, days, orders: inside.length, units: 0, netCents: 0, mrpCents: 0, offerCents: 0, customerCents: 0, giftUnits: 0, giftCents: 0,
    perDayOrders: 0, perDayNetCents: 0, averageOrderCents: 0, comboUnits: 0, singleUnits: 0, comboNetCents: 0, singleNetCents: 0, newCustomers: 0, returningCustomers: 0, failed: 0, returned: 0, channels: [] };
  const channels = new Map<string, { orders: number; netCents: number }>();
  const firstOrder = new Map<string, string>();
  for (const order of all) { if (order.isMarketing || order.exchangeReturnId || order.exchangeRequested || order.status === 'CANCELLED') continue; const key = digits(order.customerPhone); const seen = firstOrder.get(key); if (!seen || order.orderDateAd < seen) firstOrder.set(key, order.orderDateAd); }
  const customers = new Set<string>();
  for (const order of inside) {
    let orderNet = 0;
    for (const line of order.items || []) {
      if (line.isGift) { result.giftUnits += line.quantity; result.giftCents += Math.round((line.catalogUnitPrice || 0) * 100) * line.quantity; continue; }
      const money = lineMoney(line);
      result.units += line.quantity; result.netCents += money.net; result.mrpCents += money.mrp; result.offerCents += money.offer; result.customerCents += money.customer; orderNet += money.net;
      if (comboIds.has(line.productId)) { result.comboUnits += line.quantity; result.comboNetCents += money.net; } else { result.singleUnits += line.quantity; result.singleNetCents += money.net; }
    }
    const row = channels.get(order.platform || 'Other') || { orders: 0, netCents: 0 }; row.orders++; row.netCents += orderNet; channels.set(order.platform || 'Other', row);
    customers.add(digits(order.customerPhone));
    if (failures.some((failure) => failure.orderId === order.id)) result.failed++;
    if (returns.some((entry) => entry.orderId === order.id && entry.orderStatus !== 'Rejected')) result.returned++;
  }
  for (const customer of customers) { const first = firstOrder.get(customer); if (first && first >= from && first <= to) result.newCustomers++; else result.returningCustomers++; }
  result.perDayOrders = Math.round((result.orders / days) * 10) / 10;
  result.perDayNetCents = Math.round(result.netCents / days);
  result.averageOrderCents = result.orders ? Math.round(result.netCents / result.orders) : 0;
  result.channels = [...channels.entries()].map(([channel, row]) => ({ channel, ...row })).sort((a, b) => b.netCents - a.netCents);
  return result;
}

export function saleResults(campaign: SaleCampaign, allOrders: Order[], options: { today: string; failures?: DeliveryFailure[]; returns?: ReturnEntry[]; comboIds?: Iterable<string> }): SaleResults {
  const from = campaign.startsAt.slice(0, 10);
  const plannedEnd = campaign.endsAt.slice(0, 10);
  const end = campaign.status === 'ENDED' && campaign.endedAt && campaign.endedAt.slice(0, 10) < plannedEnd ? campaign.endedAt.slice(0, 10) : plannedEnd;
  const to = end > options.today ? options.today : end;
  const length = span(from, to < from ? from : to);
  const scoped = allOrders.filter((order) => inSaleScope(order, campaign));
  const comboIds = new Set(options.comboIds || []);
  const failures = options.failures || [], returns = options.returns || [];
  const during = stats(scoped, allOrders, from, to < from ? from : to, failures, returns, comboIds);
  const before = stats(scoped, allOrders, shift(from, -length), shift(from, -1), failures, returns, comboIds);
  const afterFrom = shift(end, 1), afterTo = shift(end, length);
  const after = afterFrom <= options.today ? stats(scoped, allOrders, afterFrom, afterTo > options.today ? options.today : afterTo, failures, returns, comboIds) : null;

  const insideSale = scoped.filter((order) => order.orderDateAd >= during.from && order.orderDateAd <= during.to);
  const priced = insideSale.filter((order) => order.campaignIds?.includes(campaign.id) || order.appliedOffers?.some((entry) => entry.campaignId === campaign.id));
  const other = insideSale.filter((order) => !priced.includes(order));
  const failedShare = (list: Order[]) => rate(list.filter((order) => failures.some((failure) => failure.orderId === order.id)).length, list.length);
  const returnedShare = (list: Order[]) => rate(list.filter((order) => returns.some((entry) => entry.orderId === order.id && entry.orderStatus !== 'Rejected')).length, list.length);

  const offers = campaign.offers.map((offer): OfferResult => {
    const using = priced.filter((order) => order.appliedOffers?.some((entry) => entry.offerId === offer.id));
    const entries = using.map((order) => order.appliedOffers!.find((entry) => entry.offerId === offer.id)!);
    const threshold = offer.condition.minOrderValue;
    return {
      offerId: offer.id, offerName: offer.name, orders: using.length,
      discountCents: entries.reduce((sum, entry) => sum + Math.round(entry.amount * 100), 0),
      netCents: using.reduce((sum, order) => sum + Math.round(order.totalAmount * 100), 0),
      giftUnits: entries.reduce((sum, entry) => sum + (entry.giftQuantity || 0), 0),
      giftCents: entries.reduce((sum, entry) => sum + Math.round((entry.giftValue || 0) * 100), 0),
      // Orders that landed within 10% above a minimum spend: a sign the minimum pulled baskets up.
      nearThreshold: threshold ? using.filter((order) => order.totalAmount >= threshold && order.totalAmount <= threshold * 1.1).length : 0,
    };
  });
  const discountCostCents = during.offerCents + during.giftCents;
  return {
    during, before, after,
    lift: { orders: pct(during.perDayOrders, before.perDayOrders), net: pct(during.perDayNetCents, before.perDayNetCents), averageOrder: pct(during.averageOrderCents, before.averageOrderCents) },
    extraNetCents: during.netCents - before.perDayNetCents * during.days, discountCostCents,
    offers, pricedOrders: priced.length, unpricedOrders: other.length,
    saleFailureRate: failedShare(priced), otherFailureRate: failedShare(other.length ? other : scoped.filter((order) => order.orderDateAd >= before.from && order.orderDateAd <= before.to)),
    saleReturnRate: returnedShare(priced), otherReturnRate: returnedShare(other.length ? other : scoped.filter((order) => order.orderDateAd >= before.from && order.orderDateAd <= before.to)),
  };
}
