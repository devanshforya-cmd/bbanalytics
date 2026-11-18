import type { Combo, Order, OrderItem, Product, SaleCampaign } from './types';
import { campaignState } from './offers';

export const REPORT_CHANNELS = ['Website', 'Instagram', 'WhatsApp', 'Facebook / Messenger', 'TikTok', 'Other'] as const;
type Channel = typeof REPORT_CHANNELS[number];
/**
 * Money per item, in paisa. MRP value − offer discount − customer discount = net sales.
 * Gifts are counted apart: they are stock that went out, not sales.
 */
type ReportItem = { id: string; name: string; kind: 'Product' | 'Combo' | 'Historical item'; currentPrice: number | null; quantity: number; giftUnits: number; giftCents: number;
  mrpCents: number; offerCents: number; customerCents: number; salesCents: number };
type ReportDay = { date: string; day: string; channels: Record<Channel, number>; orderCount: number; cancelled: number; netCents: number; quantities: Record<string, number>; sales: string[] };

function channelFor(value: string): Channel {
  const channel = (value || '').trim().toLowerCase();
  if (channel === 'facebook' || channel === 'messenger' || channel === 'facebook messenger' || channel === 'fb') return 'Facebook / Messenger';
  if (channel === 'website' || channel === 'web') return 'Website';
  if (channel === 'instagram' || channel === 'insta') return 'Instagram';
  if (channel === 'whatsapp' || channel === 'whats app') return 'WhatsApp';
  if (channel === 'tiktok' || channel === 'tik tok') return 'TikTok';
  return 'Other';
}

const paisa = (value: number | undefined) => Math.round((Number(value) || 0) * 100);

/**
 * The price trail of one line. Orders saved before sales and offers existed have only a total and,
 * sometimes, a discount amount: that discount is counted as a customer discount (it was agreed per order).
 */
export function lineMoney(line: OrderItem): { mrp: number; offer: number; customer: number; net: number } {
  const net = Number.isFinite(line.totalPrice) ? paisa(line.totalPrice) : paisa(line.quantity * (Number.isFinite(line.unitPrice) ? line.unitPrice : 0));
  if (line.offerDiscount !== undefined || line.customerDiscount !== undefined) {
    const offer = paisa(line.offerDiscount), customer = paisa(line.customerDiscount);
    return { mrp: line.catalogUnitPrice !== undefined ? paisa(line.catalogUnitPrice) * line.quantity : net + offer + customer, offer, customer, net };
  }
  const discount = line.discountAmount !== undefined ? paisa(line.discountAmount) : line.catalogUnitPrice !== undefined ? Math.max(0, paisa(line.catalogUnitPrice) * line.quantity - net) : 0;
  return { mrp: net + discount, offer: 0, customer: discount, net };
}

/** An order that is not a sale: a marketing send or a replacement sent for an exchange. */
const notASale = (order: Order) => !!order.isMarketing || !!order.exchangeReturnId || !!order.exchangeRequested;

export function buildMonthlySalesReport(orders: Order[], products: Product[], combos: Combo[], brand: string, start: string, end: string, campaigns: SaleCampaign[] = []) {
  const days: ReportDay[] = [];
  for (let date = new Date(`${start}T00:00:00Z`); days.length < 31 && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const iso = date.toISOString().slice(0, 10);
    const running = campaigns.filter((campaign) => !campaign.isTemplate && campaign.status !== 'DRAFT' && (!campaign.brandCodes.length || campaign.brandCodes.includes(brand))
      && campaign.startsAt.slice(0, 10) <= iso && (campaign.status === 'ENDED' && campaign.endedAt ? campaign.endedAt.slice(0, 10) : campaign.endsAt.slice(0, 10)) >= iso);
    days.push({ date: iso, day: new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(date), channels: Object.fromEntries(REPORT_CHANNELS.map(name => [name, 0])) as Record<Channel, number>,
      orderCount: 0, cancelled: 0, netCents: 0, quantities: {}, sales: running.map((campaign) => campaign.name) });
  }
  const items = new Map<string, ReportItem>();
  const blank = { quantity: 0, giftUnits: 0, giftCents: 0, mrpCents: 0, offerCents: 0, customerCents: 0, salesCents: 0 };
  for (const product of products.filter(product => product.brandCode === brand && product.active !== false)) items.set(product.id, { id: product.id, name: product.name, kind: 'Product', currentPrice: product.mrp, ...blank });
  for (const combo of combos.filter(combo => combo.brandCode === brand && combo.active !== false && combo.isActive !== false)) items.set(combo.id, { id: combo.id, name: combo.name, kind: 'Combo', currentPrice: combo.comboPrice, ...blank });
  const byDate = new Map(days.map(day => [day.date, day]));
  const channelSales = Object.fromEntries(REPORT_CHANNELS.map(name => [name, 0])) as Record<Channel, number>;
  const reasons = new Map<string, { orders: number; cents: number }>();
  const bySale = new Map<string, { name: string; orders: number; offerCents: number; netCents: number; giftUnits: number }>();
  let ordersWithCustomerDiscount = 0;
  for (const order of orders) {
    const day = byDate.get(order.orderDateAd);
    if (order.brandCode !== brand || !day || notASale(order)) continue;
    // Orders placed are counted by channel; a cancelled one is counted, then shown apart, and adds no sales.
    day.channels[channelFor(order.platform)]++; day.orderCount++;
    if (order.status === 'CANCELLED') { day.cancelled++; continue; }
    let orderNet = 0, orderCustomer = 0;
    for (const line of order.items || []) {
      if (!line.productId || !Number.isFinite(line.quantity) || line.quantity <= 0) continue;
      let item = items.get(line.productId);
      if (!item) {
        const product = products.find(entry => entry.id === line.productId && entry.brandCode === brand);
        const combo = combos.find(entry => entry.id === line.productId && entry.brandCode === brand);
        item = { id: line.productId, name: product?.name || combo?.name || line.productName || 'Deleted item', kind: product ? 'Product' : combo ? 'Combo' : 'Historical item', currentPrice: product?.mrp ?? combo?.comboPrice ?? null, ...blank };
        items.set(item.id, item);
      }
      if (line.isGift) { item.giftUnits += line.quantity; item.giftCents += paisa(line.catalogUnitPrice) * line.quantity; continue; }
      const money = lineMoney(line);
      day.quantities[item.id] = (day.quantities[item.id] || 0) + line.quantity;
      item.quantity += line.quantity; item.mrpCents += money.mrp; item.offerCents += money.offer; item.customerCents += money.customer; item.salesCents += money.net;
      orderNet += money.net; orderCustomer += money.customer;
    }
    day.netCents += orderNet; channelSales[channelFor(order.platform)] += orderNet;
    if (orderCustomer > 0) {
      ordersWithCustomerDiscount++;
      const reason = order.customerDiscountReason || 'Not given';
      const row = reasons.get(reason) || { orders: 0, cents: 0 }; row.orders++; row.cents += orderCustomer; reasons.set(reason, row);
    }
    for (const offer of order.appliedOffers || []) {
      const row = bySale.get(offer.campaignId) || { name: offer.campaignName, orders: 0, offerCents: 0, netCents: 0, giftUnits: 0 };
      if (!(order.appliedOffers || []).slice(0, (order.appliedOffers || []).indexOf(offer)).some((other) => other.campaignId === offer.campaignId)) { row.orders++; row.netCents += orderNet; }
      row.offerCents += paisa(offer.amount); row.giftUnits += offer.giftQuantity || 0; bySale.set(offer.campaignId, row);
    }
    for (const name of new Set((order.appliedOffers || []).map((offer) => offer.campaignName))) if (!day.sales.includes(name)) day.sales.push(name);
  }
  const rank = { Product: 0, Combo: 1, 'Historical item': 2 };
  const columns = [...items.values()].sort((a,b) => rank[a.kind] - rank[b.kind] || a.name.localeCompare(b.name));
  const channels = Object.fromEntries(REPORT_CHANNELS.map(name => [name, days.reduce((sum, day) => sum + day.channels[name], 0)])) as Record<Channel, number>;
  const sum = (key: keyof Pick<ReportItem, 'mrpCents' | 'offerCents' | 'customerCents' | 'salesCents' | 'giftUnits' | 'giftCents' | 'quantity'>) => columns.reduce((total, item) => total + item[key], 0);
  return {
    days, items: columns, channels, channelSales,
    orderCount: days.reduce((total, day) => total + day.orderCount, 0), cancelledCount: days.reduce((total, day) => total + day.cancelled, 0),
    salesCents: sum('salesCents'), mrpCents: sum('mrpCents'), offerCents: sum('offerCents'), customerCents: sum('customerCents'), giftUnits: sum('giftUnits'), giftCents: sum('giftCents'), units: sum('quantity'),
    ordersWithCustomerDiscount,
    discountReasons: [...reasons.entries()].map(([reason, row]) => ({ reason, ...row })).sort((a, b) => b.cents - a.cents),
    sales: [...bySale.entries()].map(([id, row]) => ({ id, ...row, state: campaigns.find((campaign) => campaign.id === id) ? campaignState(campaigns.find((campaign) => campaign.id === id)!, `${end}T23:59`) : 'Ended' })),
  };
}
