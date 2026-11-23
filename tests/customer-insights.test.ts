import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelLoyalty, customerHistories, purchaseCycles, repeatSteps } from '../src/lib/customer-insights.ts';

const order = (phone: string, date: string, platform: string, extra: Record<string, unknown> = {}) =>
  ({ id: `${phone}-${date}`, customerPhone: phone, orderDateAd: date, platform, status: 'DELIVERED', totalAmount: 1000, brandCode: 'FORYA', items: [], source: 'WHATSAPP_EXTRACTOR', ...extra }) as any;

const orders = [
  order('9800000001', '2026-09-01', 'Instagram'), order('9800000001', '2026-09-21', 'Instagram'), order('9800000001', '2026-10-11', 'WhatsApp'),
  order('9800000002', '2026-10-01', 'Instagram'),
  order('9800000003', '2026-10-05', 'TikTok'), order('9800000003', '2026-10-15', 'TikTok', { status: 'CANCELLED' }),
  order('9800000004', '2026-11-01', 'Messenger'),
];
const customers = [{ phone: '9800000001', karmaScore: 90, segment: 'LOYAL' }, { phone: '9800000002', karmaScore: 60, segment: 'NEW' }] as any[];

test('channel is the order platform, not where the order text was pasted from', () => {
  const rows = channelLoyalty(customerHistories(orders), customers, orders);
  const by = Object.fromEntries(rows.map((r) => [r.channel, r]));
  assert.deepEqual(rows.map((r) => r.channel), ['Instagram', 'TikTok', 'Messenger', 'WhatsApp']);
  assert.equal(by.Instagram.customerCount, 2);
  assert.equal(by.Instagram.orderCount, 4);
  assert.equal(by.Instagram.repeatRate, 50, 'one of two Instagram customers bought again');
  assert.equal(by.Instagram.stayedPct, 50, 'of the two repeat orders, one came back through Instagram');
  assert.equal(by.Instagram.avgKarma, 75);
  assert.equal(by.TikTok.repeatRate, 0, 'a cancelled second order is not a repeat purchase');
  assert.equal(by.TikTok.avgKarma, null, 'no made-up karma when there is no record');
  assert.equal(by.WhatsApp.customerCount, 0);
  assert.equal(by.WhatsApp.ordersHere, 1);
});

test('repeat steps and purchase cycles come from real sales', () => {
  const h = customerHistories(orders);
  assert.deepEqual(repeatSteps(h), [4, 1, 1, 0, 0]);
  const cycles = purchaseCycles(h, customers);
  assert.equal(cycles.LOYAL, 20);
  assert.equal(cycles.VIP, null);
  assert.equal(h.get('9800000003')!.spend, 1000, 'cancelled orders are not spend');
});
