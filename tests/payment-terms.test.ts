import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTerms, hasCreditLimit, parseTerms } from '../src/lib/payment-terms';
import { paymentDueDate } from '../src/lib/dispatch-flow';

test('any number of credit days is saved and read back, and drives the due date', () => {
  assert.equal(formatTerms('CREDIT', 45), '45-day credit');
  assert.deepEqual(parseTerms('45-day credit'), { kind: 'CREDIT', days: 45 });
  assert.deepEqual(parseTerms('Credit 21 days'), { kind: 'CREDIT', days: 21 });
  assert.deepEqual(parseTerms('COD'), { kind: 'COD', days: 0 });
  assert.deepEqual(parseTerms('Advance payment'), { kind: 'ADVANCE', days: 0 });
  assert.equal(paymentDueDate('2026-11-26', formatTerms('CREDIT', 45)), '2027-01-10');
  assert.equal(paymentDueDate('2026-11-26', formatTerms('ADVANCE', 0)), '');
  assert.equal(formatTerms('CREDIT', 900), '365-day credit');
});

test('an empty or zero credit limit means no limit', () => {
  assert.equal(hasCreditLimit(undefined), false);
  assert.equal(hasCreditLimit(0), false);
  assert.equal(hasCreditLimit(150000), true);
});
