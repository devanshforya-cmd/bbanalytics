import { Customer, CustomerSegment, KarmaEvent } from './types';

export const KARMA_RULES = {
  STARTING_SCORE: 70,
  ORDER_PLACED: 2,
  ORDER_DELIVERED: 1,
  PREPAID_PAYMENT: 1,
  REVIEW_GIVEN: 3,
  POSITIVE_REVIEW_BONUS: 2,
  ACTUAL_RETURN: -3,
  DELIVERY_FAILURE: -5,
  ORDER_CANCELLATION: -5,
  COD_REFUSAL: -8,
  COMPLAINT_FILED: -2,
  FIVE_CLEAN_ORDERS_BONUS: 10,
};

export function calculateCustomerSegment(
  karmaScore: number,
  totalOrders: number,
  totalDelivered: number,
  totalReturns: number
): CustomerSegment {
  if (karmaScore < 20) return 'BLACKLISTED';
  if (karmaScore < 40) return 'AT_RISK';
  if (totalDelivered >= 10 && karmaScore >= 85 && totalReturns === 0) return 'VIP';
  if (totalOrders >= 5 && karmaScore >= 75) return 'LOYAL';
  if (totalOrders >= 2 && karmaScore >= 55) return 'REGULAR';
  return 'NEW';
}

export function evaluateCustomerFlags(
  totalReturns: number,
  totalDeliveryFailures: number,
  totalCancellations: number
): string[] {
  const flags: string[] = [];
  if (totalReturns >= 3) {
    flags.push('Serial Returner');
  }
  if (totalDeliveryFailures >= 2) {
    flags.push('Non-Receiver');
  }
  if (totalCancellations >= 3) {
    flags.push('Order Canceller');
  }
  return flags;
}

export function applyKarmaEvent(
  customer: Customer,
  eventType: string,
  pointsDelta: number,
  notes?: string
): { updatedCustomer: Customer; event: KarmaEvent } {
  const newScore = Math.max(0, Math.min(100, customer.karmaScore + pointsDelta));
  const newSegment = calculateCustomerSegment(
    newScore,
    customer.totalOrders,
    customer.totalDelivered,
    customer.totalReturns
  );
  const newFlags = evaluateCustomerFlags(
    customer.totalReturns,
    customer.totalDeliveryFailures,
    customer.totalCancellations
  );

  const updatedCustomer: Customer = {
    ...customer,
    karmaScore: newScore,
    segment: newSegment,
    activeFlags: newFlags,
  };

  const event: KarmaEvent = {
    id: `ke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    customerPhone: customer.phone,
    eventType,
    points: pointsDelta,
    balanceAfter: newScore,
    notes,
    createdAt: new Date().toISOString(),
  };

  return { updatedCustomer, event };
}
