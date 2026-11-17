/**
 * Short document IDs (November 2026 change 8).
 *
 * Format: PREFIX-NNNN, for example FOR-0421. The number is a running counter
 * per prefix, padded to four digits and growing naturally after 9999.
 * Counters are allocated on the server only (see db/document-counter.ts);
 * this module holds the pure formatting and search rules shared by both sides.
 */

/** Prefixes owned by non-order documents. A brand may not use them. */
export const RESERVED_PREFIXES = { marketingSends: 'MS', secondaryOrders: 'SO', dispatches: 'DP' } as const;
export type NumberedCollection = 'orders' | keyof typeof RESERVED_PREFIXES;

const SHORT_ID = /^[A-Z0-9]{2,4}-\d{4,}$/;
/** Numbers a browser shows while a record waits for the server to number it. */
const PENDING_ID = /^PENDING-/i;

/** Swap this one function to change the format (for example to a date-coded ID). */
export function formatDocumentId(prefix: string, sequence: number): string {
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}

export function isShortDocumentId(value: unknown): value is string {
  return typeof value === 'string' && SHORT_ID.test(value);
}

export function isPendingDocumentId(value: unknown): boolean {
  return typeof value === 'string' && PENDING_ID.test(value);
}

export function pendingDocumentId(): string {
  const random = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `PENDING-${random.toUpperCase()}`;
}

/** What a person should see: the short ID, or a neutral label while it is being assigned. */
export function displayDocumentId(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—';
  return isPendingDocumentId(value) ? 'Awaiting ID' : value;
}

export function cleanPrefix(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Two or three letters or digits, and not one of the document prefixes. */
export function validateBrandPrefix(value: unknown): string {
  const prefix = cleanPrefix(value);
  if (prefix.length < 2 || prefix.length > 3) throw new Error('An order ID prefix needs two or three letters or digits.');
  if ((Object.values(RESERVED_PREFIXES) as string[]).includes(prefix)) throw new Error(`${prefix} is reserved for another document type. Choose a different prefix.`);
  return prefix;
}

/** Default: the first three letters of the brand code. */
export function defaultBrandPrefix(brandCode: string): string {
  const cleaned = cleanPrefix(brandCode);
  let prefix = cleaned.slice(0, 3);
  if (prefix.length < 2) prefix = (prefix + 'XX').slice(0, 2);
  if ((Object.values(RESERVED_PREFIXES) as string[]).includes(prefix)) prefix = (cleaned + 'X').slice(0, 3);
  return prefix;
}

export function brandPrefix(brandCode: string, saved?: Record<string, string> | null): string {
  const code = String(brandCode || '').trim().toUpperCase();
  const configured = saved && Object.entries(saved).find(([key]) => key.trim().toUpperCase() === code)?.[1];
  if (configured) { try { return validateBrandPrefix(configured); } catch { /* fall back to the default */ } }
  return defaultBrandPrefix(code);
}

/** Lower-case letters and digits only, so "FOR-0421", "for0421" and "For 0421" all compare equal. */
export function normalizeIdQuery(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * True when a search term refers to this document by its short ID or its
 * earlier long ID. Case and the hyphen are ignored, and the digits alone match.
 */
export function matchesDocumentId(query: string, ...ids: (string | undefined | null)[]): boolean {
  const term = normalizeIdQuery(query);
  if (term.length < 2) return false;
  return ids.some((id) => {
    if (!id) return false;
    const normal = normalizeIdQuery(id);
    if (normal.includes(term)) return true;
    // "421" should find FOR-0421: compare numbers without their zero padding.
    if (/^\d+$/.test(term) && isShortDocumentId(id)) return String(Number(id.split('-')[1])) === String(Number(term));
    return false;
  });
}

/** Day number: 1 for the first order created on a date, 2 for the next, and so on. Display only. */
export function dayNumbers<T extends { id: string; createdAt?: string }>(ordersOfOneDay: T[]): Map<string, number> {
  const sorted = [...ordersOfOneDay].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
  return new Map(sorted.map((order, index) => [order.id, index + 1]));
}
