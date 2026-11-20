/**
 * Money, customer and influencer details are removed on the server before records reach anyone
 * whose role does not include them, and put back when that person saves a record, so hiding a
 * value never overwrites it.
 *
 * Money becomes 0 (screens show it as hidden), phone numbers keep their first two and last three
 * digits so people can still tell customers apart, and addresses and emails are blanked.
 */
import type { SensitiveKey } from './access-catalog';
import { canSeeSensitive, type UserWithPermissions } from './permissions';

export const MASK = '•';
export const HIDDEN_TEXT = 'Hidden';

type Rule = { key: SensitiveKey; numbers?: string[]; itemNumbers?: string[]; offerNumbers?: string[]; addOnNumbers?: string[]; changeNumbers?: string[]; phones?: string[]; texts?: string[] };

const RULES: Record<string, Rule[]> = {
  orders: [
    { key: 's.money', numbers: ['totalAmount', 'statedPrice', 'discountPercent', 'customerDiscount'],
      itemNumbers: ['unitPrice', 'totalPrice', 'catalogUnitPrice', 'discountAmount', 'offerUnitPrice', 'offerDiscount', 'customerDiscount'],
      offerNumbers: ['amount', 'giftValue'], addOnNumbers: ['total'], changeNumbers: ['previousTotal'] },
    { key: 's.customers', phones: ['customerPhone', 'alternatePhone'], texts: ['address'] },
  ],
  secondaryOrders: [{ key: 's.money', numbers: ['totalAmount'], itemNumbers: ['unitPrice', 'totalAmount'] }],
  cheques: [{ key: 's.money', numbers: ['amount'] }],
  dispatches: [{ key: 's.money', numbers: ['amountDue', 'totalAmount'], itemNumbers: ['unitPrice'] }],
  products: [{ key: 's.money', numbers: ['costPrice', 'dtpPrice', 'wholesalePrice'] }],
  customers: [{ key: 's.customers', phones: ['phone'], texts: ['address', 'email'] }],
  returns: [{ key: 's.customers', phones: ['customerPhone'] }],
  feedbackEntries: [{ key: 's.customers', phones: ['customerPhone'] }],
  deliveryFailures: [{ key: 's.customers', phones: ['customerPhone'], texts: ['address'] }],
  influencers: [{ key: 's.influencers', phones: ['phone'], texts: ['email', 'address'] }],
  marketingSends: [{ key: 's.influencers', phones: ['deliveryPhone'], texts: ['deliveryAddress'] }],
};

export function maskPhone(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 5) return MASK.repeat(digits.length);
  return `${digits.slice(0, 2)}${MASK.repeat(digits.length - 5)}${digits.slice(-3)}`;
}

export function isMasked(value: unknown): boolean {
  return typeof value === 'string' && (value.includes(MASK) || value === HIDDEN_TEXT);
}

function rulesFor(collection: string, user: UserWithPermissions): Rule[] {
  return (RULES[collection] || []).filter((rule) => !canSeeSensitive(user, rule.key));
}

/** Does this person lose anything in this collection? */
export function hidesAnything(collection: string, user: UserWithPermissions): boolean {
  return rulesFor(collection, user).length > 0;
}

function zero(target: Record<string, any>, fields: string[] = []) {
  for (const field of fields) if (typeof target[field] === 'number') target[field] = 0;
}

/** A copy of the record without the details this person may not see. */
export function redactRecord<T extends Record<string, any>>(collection: string, data: T, user: UserWithPermissions): T {
  const rules = rulesFor(collection, user);
  if (!rules.length || !data) return data;
  const copy: Record<string, any> = { ...data };
  for (const rule of rules) {
    zero(copy, rule.numbers);
    if (rule.itemNumbers && Array.isArray(copy.items)) copy.items = copy.items.map((item: any) => { const next = { ...item }; zero(next, rule.itemNumbers); return next; });
    if (rule.offerNumbers && Array.isArray(copy.appliedOffers)) copy.appliedOffers = copy.appliedOffers.map((offer: any) => { const next = { ...offer }; zero(next, rule.offerNumbers); return next; });
    if (rule.addOnNumbers && Array.isArray(copy.extractorAddOns)) copy.extractorAddOns = copy.extractorAddOns.map((entry: any) => { const next = { ...entry }; zero(next, rule.addOnNumbers); return next; });
    if (rule.changeNumbers && Array.isArray(copy.extractorChanges)) copy.extractorChanges = copy.extractorChanges.map((entry: any) => { const next = { ...entry }; zero(next, rule.changeNumbers); return next; });
    for (const field of rule.phones || []) if (copy[field]) copy[field] = maskPhone(copy[field]);
    for (const field of rule.texts || []) if (copy[field]) copy[field] = HIDDEN_TEXT;
  }
  copy._hidden = [...new Set([...(Array.isArray(data._hidden) ? data._hidden : []), ...rules.map((rule) => rule.key)])];
  return copy as T;
}

/**
 * Before saving a change from someone who could not see some details, put the stored values back.
 * New records keep what was typed. New order lines keep their prices; existing lines get theirs back.
 */
export function restoreRedacted<T extends Record<string, any>>(collection: string, incoming: T, prior: Record<string, any> | undefined | null, user: UserWithPermissions): T {
  const next: Record<string, any> = { ...incoming };
  delete next._hidden;
  const rules = rulesFor(collection, user);
  if (!rules.length || !prior) return next as T;
  for (const rule of rules) {
    for (const field of rule.numbers || []) if (field in prior) next[field] = prior[field]; else delete next[field];
    for (const field of [...(rule.phones || []), ...(rule.texts || [])]) if (field in prior) next[field] = prior[field]; else if (isMasked(next[field])) delete next[field];
    if (rule.itemNumbers && Array.isArray(next.items)) {
      const before = Array.isArray(prior.items) ? prior.items : [];
      const used = new Set<number>();
      next.items = next.items.map((item: any) => {
        const index = before.findIndex((old: any, i: number) => !used.has(i) && old?.productId === item?.productId);
        if (index < 0) return item;
        used.add(index);
        const restored = { ...item };
        for (const field of rule.itemNumbers!) if (field in before[index]) restored[field] = before[index][field]; else delete restored[field];
        // Quantities can change; keep the line total in step with the stored unit price.
        if (typeof restored.unitPrice === 'number' && typeof restored.quantity === 'number' && 'totalPrice' in before[index] && restored.quantity !== before[index].quantity) {
          const discount = Number(restored.discountAmount || 0);
          restored.totalPrice = Math.max(0, restored.unitPrice * restored.quantity - discount);
        }
        return restored;
      });
    }
    if (rule.offerNumbers && 'appliedOffers' in prior) next.appliedOffers = prior.appliedOffers;
    if (rule.changeNumbers && 'extractorChanges' in prior) next.extractorChanges = prior.extractorChanges;
    if (rule.addOnNumbers && 'extractorAddOns' in prior && Array.isArray(next.extractorAddOns)) {
      const totals = new Map((prior.extractorAddOns || []).map((entry: any) => [entry.clientId, entry.total]));
      next.extractorAddOns = next.extractorAddOns.map((entry: any) => totals.has(entry.clientId) ? { ...entry, total: totals.get(entry.clientId) } : entry);
    }
  }
  return next as T;
}
