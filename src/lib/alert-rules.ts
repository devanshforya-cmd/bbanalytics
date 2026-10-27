export const DEFAULT_ALERT_RULES = { chequeOverdueDays: 1, handoverGapDays: 2, unvisitedStoreAlertDays: 10, failureRateThreshold: 15 };
export type AlertRules = typeof DEFAULT_ALERT_RULES;
export function validateAlertRules(value: unknown): AlertRules {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter valid alert thresholds.');
  const rules = value as AlertRules;
  for (const [key, min, max] of [['chequeOverdueDays', 1, 15], ['handoverGapDays', 1, 7], ['unvisitedStoreAlertDays', 5, 30], ['failureRateThreshold', 5, 50]] as const) {
    if (!Number.isInteger(rules[key]) || rules[key] < min || rules[key] > max) throw new Error(`Invalid ${key} threshold.`);
  }
  return Object.fromEntries(Object.keys(DEFAULT_ALERT_RULES).map(key => [key, rules[key as keyof AlertRules]])) as AlertRules;
}

export function thresholdAlerts(data: { cheques: any[]; stores: any[]; visits: any[]; orders: any[]; deliveryFailures: any[] }, rules: AlertRules, now = Date.now()): string[] {
  const age = (date: unknown) => { const time = Date.parse(String(date || '')); return Number.isFinite(time) ? Math.floor((now - time) / 86400000) : -1; };
  const openCheques = data.cheques.filter(cheque => !['CASHED', 'CLEARED', 'BOUNCED', 'LOST', 'RETURNED_TO_STORE', 'CANCELLED'].includes(cheque.status));
  const overdue = openCheques.filter(cheque => age(cheque.cashDateAd) >= rules.chequeOverdueDays).length;
  const handovers = openCheques.filter(cheque => !cheque.handoverTimestamp && age(cheque.receivedDateAd) >= rules.handoverGapDays).length;
  const unvisited = data.stores.filter(store => {
    const dates = data.visits.filter(visit => (visit.storeId || visit.entityId) === store.id).map(visit => visit.dateAd).filter(Boolean).sort();
    return age(dates.at(-1) || store.lastVisitDate) >= rules.unvisitedStoreAlertDays;
  }).length;
  const orders = data.orders.filter(order => age(order.orderDateAd) >= 0 && age(order.orderDateAd) < 7);
  const failedOrders = new Set(data.deliveryFailures.filter(failure => age(failure.dateAd) >= 0 && age(failure.dateAd) < 7).map(failure => failure.orderId || failure.orderNumber));
  const failures = orders.filter(order => failedOrders.has(order.id) || failedOrders.has(order.orderNumber)).length;
  const rate = orders.length ? failures / orders.length * 100 : 0;
  return [
    overdue ? `${overdue} cheque(s) overdue by at least ${rules.chequeOverdueDays} day(s).` : '',
    handovers ? `${handovers} field cheque handover(s) pending for at least ${rules.handoverGapDays} day(s).` : '',
    unvisited ? `${unvisited} store(s) have no recorded visit in ${rules.unvisitedStoreAlertDays} days.` : '',
    orders.length && rate >= rules.failureRateThreshold ? `Weekly delivery failure rate is ${rate.toFixed(1)}% (${failures}/${orders.length} orders).` : '',
  ].filter(Boolean);
}
