/**
 * Store payment terms are saved as plain text that the rest of the app reads for the number of days
 * ("Cash on delivery", "Advance", "45-day credit"). Any number of days works.
 */
export type TermsKind = 'COD' | 'ADVANCE' | 'CREDIT';
export const MAX_CREDIT_DAYS = 365;
export const CREDIT_PRESETS = [7, 15, 30, 45, 60, 90];

export function parseTerms(terms?: string | null): { kind: TermsKind; days: number } {
  const text = (terms || '').trim();
  if (!text || /cash|cod/i.test(text)) return { kind: 'COD', days: 0 };
  if (/advance|prepaid/i.test(text)) return { kind: 'ADVANCE', days: 0 };
  const days = Number(/(\d+)/.exec(text)?.[1] || 0);
  return days > 0 ? { kind: 'CREDIT', days: Math.min(MAX_CREDIT_DAYS, days) } : { kind: 'COD', days: 0 };
}

export function formatTerms(kind: TermsKind, days: number): string {
  if (kind === 'ADVANCE') return 'Advance payment';
  if (kind === 'CREDIT' && days > 0) return `${Math.min(MAX_CREDIT_DAYS, Math.round(days))}-day credit`;
  return 'COD';
}

/** A credit limit of nothing (or 0) means no limit. */
export function hasCreditLimit(limit?: number | null): limit is number {
  return typeof limit === 'number' && Number.isFinite(limit) && limit > 0;
}
