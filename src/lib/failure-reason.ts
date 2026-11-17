/**
 * Delivery failure reasons. "Other" needs a typed explanation, saved as reasonDetail so
 * the reason itself stays "Other" and reason charts keep one bucket for it.
 */
export const REASON_DETAIL_MAX = 300;

export function isOtherReason(reason: string | undefined | null): boolean {
  return /^\s*others?\s*$/i.test(reason || '');
}

/** The label shown to people: "Other: gate locked, no answer" or just the reason. */
export function failureReasonLabel(entry: { reason: string; reasonDetail?: string }): string {
  const detail = (entry.reasonDetail || '').trim();
  return detail ? `${entry.reason}: ${detail}` : entry.reason;
}
