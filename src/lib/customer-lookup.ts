import type { Customer } from './types';

/**
 * Phone-first customer lookup rules (November 2026 change 9).
 * Pure functions so the same matching runs in the browser and in tests.
 */

/** +977, spaces, dashes, brackets and one leading zero are all treated alike. */
export function phoneDigits(input: unknown): string {
  let digits = String(input ?? '').replace(/\D/g, '');
  if (digits.startsWith('977') && digits.length > 10) digits = digits.slice(3);
  if (digits.startsWith('0') && digits.length > 10) digits = digits.slice(1);
  return digits;
}

/** A complete Nepal mobile number: ten digits starting 97 or 98. */
export function isFullPhone(input: unknown): boolean {
  return /^(97|98)\d{8}$/.test(phoneDigits(input));
}

export interface CustomerMatch { customer: Customer; matchedOn: 'phone' | 'name' }

/**
 * Up to `limit` customers whose number contains the typed digits anywhere,
 * or whose name contains the typed text. Suggestions start at three characters.
 */
export function searchCustomers(customers: Customer[], query: string, limit = 8): CustomerMatch[] {
  const text = String(query || '').trim().toLowerCase();
  const digits = phoneDigits(query);
  const hasLetters = /[a-zऀ-ॿ]/i.test(text);
  if (hasLetters ? text.length < 3 : digits.length < 3) return [];
  const scored: { match: CustomerMatch; score: number }[] = [];
  for (const customer of customers) {
    const phone = phoneDigits(customer.phone);
    if (!hasLetters && digits && phone.includes(digits)) {
      const score = phone === digits ? 0 : phone.startsWith(digits) ? 1 : phone.endsWith(digits) ? 2 : 3;
      scored.push({ match: { customer, matchedOn: 'phone' }, score });
    } else if (hasLetters && (customer.name || '').toLowerCase().includes(text)) {
      scored.push({ match: { customer, matchedOn: 'name' }, score: (customer.name || '').toLowerCase().startsWith(text) ? 4 : 5 });
    }
  }
  return scored
    .sort((a, b) => a.score - b.score || (b.match.customer.lastOrderDate || '').localeCompare(a.match.customer.lastOrderDate || '') || (a.match.customer.name || '').localeCompare(b.match.customer.name || ''))
    .slice(0, limit).map((entry) => entry.match);
}

export function exactCustomer(customers: Customer[], phone: string): Customer | undefined {
  if (!isFullPhone(phone)) return undefined;
  const digits = phoneDigits(phone);
  return customers.find((customer) => phoneDigits(customer.phone) === digits);
}

/** Existing customers whose number differs from a full typed number by exactly one digit. */
export function nearMissCustomers(customers: Customer[], phone: string, limit = 3): Customer[] {
  if (!isFullPhone(phone)) return [];
  const digits = phoneDigits(phone);
  return customers.filter((customer) => {
    const other = phoneDigits(customer.phone);
    if (other.length !== digits.length || other === digits) return false;
    let differences = 0;
    for (let index = 0; index < digits.length; index++) if (digits[index] !== other[index] && ++differences > 1) return false;
    return differences === 1;
  }).slice(0, limit);
}

export function namesDiffer(typed: string, onFile: string): boolean {
  const clean = (value: string) => value.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]/g, '');
  return !!clean(typed) && !!clean(onFile) && clean(typed) !== clean(onFile);
}
