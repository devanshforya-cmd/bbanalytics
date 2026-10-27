import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ALERT_RULES, thresholdAlerts, validateAlertRules } from '../src/lib/alert-rules.ts';

test('alert thresholds reject invalid values and exclude cashed/lost cheques', () => {
  assert.throws(() => validateAlertRules({ ...DEFAULT_ALERT_RULES, handoverGapDays: -1 }));
  const data = { cheques: [
    { status: 'CASHED', cashDateAd: '2026-10-01', receivedDateAd: '2026-10-01' },
    { status: 'LOST', cashDateAd: '2026-10-01', receivedDateAd: '2026-10-01' },
    { status: 'PENDING', cashDateAd: '2026-10-01', receivedDateAd: '2026-10-01' },
  ], stores: [], visits: [], orders: [], deliveryFailures: [] };
  const alerts = thresholdAlerts(data, DEFAULT_ALERT_RULES, Date.parse('2026-10-10T12:00:00Z'));
  assert.equal(alerts.length, 2);
  assert(alerts.every(message => message.startsWith('1 ')));
  assert.equal(thresholdAlerts({ ...data, cheques: [] }, DEFAULT_ALERT_RULES).length, 0);
});
