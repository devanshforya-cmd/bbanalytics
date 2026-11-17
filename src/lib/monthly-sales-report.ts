import type { Combo, Order, Product } from './types';

export const REPORT_CHANNELS = ['Website', 'Instagram', 'WhatsApp', 'Facebook / Messenger', 'TikTok', 'Other'] as const;
type Channel = typeof REPORT_CHANNELS[number];
type ReportItem = { id: string; name: string; kind: 'Product' | 'Combo' | 'Historical item'; currentPrice: number | null; quantity: number; salesCents: number };
type ReportDay = { date: string; day: string; channels: Record<Channel, number>; orderCount: number; quantities: Record<string, number> };

function channelFor(value: string): Channel {
  const channel = (value || '').trim().toLowerCase();
  if (channel === 'facebook' || channel === 'messenger' || channel === 'facebook messenger' || channel === 'fb') return 'Facebook / Messenger';
  if (channel === 'website' || channel === 'web') return 'Website';
  if (channel === 'instagram' || channel === 'insta') return 'Instagram';
  if (channel === 'whatsapp' || channel === 'whats app') return 'WhatsApp';
  if (channel === 'tiktok' || channel === 'tik tok') return 'TikTok';
  return 'Other';
}

export function buildMonthlySalesReport(orders: Order[], products: Product[], combos: Combo[], brand: string, start: string, end: string) {
  const days: ReportDay[] = [];
  for (let date = new Date(`${start}T00:00:00Z`); days.length < 31 && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    days.push({ date: date.toISOString().slice(0, 10), day: new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(date), channels: Object.fromEntries(REPORT_CHANNELS.map(name => [name, 0])) as Record<Channel, number>, orderCount: 0, quantities: {} });
  }
  const items = new Map<string, ReportItem>();
  for (const product of products.filter(product => product.brandCode === brand && product.active !== false)) items.set(product.id, { id: product.id, name: product.name, kind: 'Product', currentPrice: product.mrp, quantity: 0, salesCents: 0 });
  for (const combo of combos.filter(combo => combo.brandCode === brand && combo.active !== false && combo.isActive !== false)) items.set(combo.id, { id: combo.id, name: combo.name, kind: 'Combo', currentPrice: combo.comboPrice, quantity: 0, salesCents: 0 });
  const byDate = new Map(days.map(day => [day.date, day]));
  for (const order of orders) {
    const day = byDate.get(order.orderDateAd);
    if (order.brandCode !== brand || !day || order.isMarketing) continue;
    day.channels[channelFor(order.platform)]++; day.orderCount++;
    for (const line of order.items || []) {
      if (!line.productId || !Number.isFinite(line.quantity) || line.quantity <= 0) continue;
      let item = items.get(line.productId);
      if (!item) {
        const product = products.find(entry => entry.id === line.productId && entry.brandCode === brand);
        const combo = combos.find(entry => entry.id === line.productId && entry.brandCode === brand);
        item = { id: line.productId, name: product?.name || combo?.name || line.productName || 'Deleted item', kind: product ? 'Product' : combo ? 'Combo' : 'Historical item', currentPrice: product?.mrp ?? combo?.comboPrice ?? null, quantity: 0, salesCents: 0 };
        items.set(item.id, item);
      }
      day.quantities[item.id] = (day.quantities[item.id] || 0) + line.quantity;
      item.quantity += line.quantity;
      const amount = Number.isFinite(line.totalPrice) ? line.totalPrice : line.quantity * (Number.isFinite(line.unitPrice) ? line.unitPrice : 0);
      item.salesCents += Math.round(amount * 100);
    }
  }
  const rank = { Product: 0, Combo: 1, 'Historical item': 2 };
  const columns = [...items.values()].sort((a,b) => rank[a.kind] - rank[b.kind] || a.name.localeCompare(b.name));
  const channels = Object.fromEntries(REPORT_CHANNELS.map(name => [name, days.reduce((sum, day) => sum + day.channels[name], 0)])) as Record<Channel, number>;
  return { days, items: columns, channels, orderCount: days.reduce((sum, day) => sum + day.orderCount, 0), salesCents: columns.reduce((sum, item) => sum + item.salesCents, 0) };
}
