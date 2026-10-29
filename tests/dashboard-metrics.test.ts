import test from 'node:test';
import assert from 'node:assert/strict';
import { averageDeliveryTime, isInsideValley, topRegionalComplaint } from '../src/lib/dashboard-metrics.ts';
import type { Order, FeedbackEntry } from '../src/lib/types.ts';

test('regional metrics use recorded deliveries and linked complaints, with honest empty states', () => {
  const delivered = { id: 'o1', district: 'Kathmandu', province: 'Bagmati', orderDateAd: '2026-10-01', status: 'DELIVERED', deliveryProof: { deliveryDateAd: '2026-10-03' } } as Order;
  assert.equal(averageDeliveryTime([]), 'No recorded deliveries');
  assert.equal(averageDeliveryTime([delivered]), '2.0 days');
  assert.equal(averageDeliveryTime([{ ...delivered, status: 'PENDING' }]), 'No recorded deliveries');
  assert.equal(isInsideValley(delivered), true);
  assert.equal(isInsideValley({ ...delivered, district: 'Chitwan' }), false);
  const feedback = [{ type: 'COMPLAINT', orderId: 'o1', issueCategories: ['Damage'] }, { type: 'COMPLAINT', orderId: 'unrelated', issueCategories: ['Wrong shade', 'Wrong shade'] }] as FeedbackEntry[];
  assert.equal(topRegionalComplaint(feedback, [delivered]), 'Damage');
  assert.equal(topRegionalComplaint(feedback, []), 'No linked complaints');
});
