import type { FeedbackEntry, Order } from './types';

export function isInsideValley(order: Order): boolean {
  return ['kathmandu', 'lalitpur', 'bhaktapur'].some(district => String(order.district || '').toLowerCase().includes(district));
}

export function averageDeliveryTime(orders: Order[]): string {
  const days = orders.flatMap(order => {
    const delivered = order.deliveryProof?.deliveryDateAd;
    if (!delivered || order.status !== 'DELIVERED') return [];
    const elapsed = (Date.parse(delivered.slice(0, 10)) - Date.parse(order.orderDateAd?.slice(0, 10))) / 86400000;
    return Number.isFinite(elapsed) && elapsed >= 0 ? [elapsed] : [];
  });
  if (!days.length) return 'No recorded deliveries';
  const average = days.reduce((sum, value) => sum + value, 0) / days.length;
  return average === 0 ? 'Same day' : `${average.toFixed(1)} days`;
}

export function topRegionalComplaint(feedback: FeedbackEntry[], orders: Order[]): string {
  const ids = new Set(orders.map(order => order.id));
  const counts = new Map<string, number>();
  for (const entry of feedback) {
    if (entry.type !== 'COMPLAINT' || !entry.orderId || !ids.has(entry.orderId)) continue;
    for (const category of entry.issueCategories || []) counts.set(category, (counts.get(category) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || 'No linked complaints';
}
