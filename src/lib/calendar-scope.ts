/**
 * Which calendar each part of the app uses.
 * - D2C: online orders, reviews and returns, customers, marketing. AD only, in forms, lists and exports.
 * - B2B: offline field sales. BS and AD together, in forms, lists and exports.
 * - USER: dashboard, settings and the rest follow the person's own preference.
 */
export type CalendarScope = 'D2C' | 'B2B' | 'USER';

const D2C_PATHS = ['/orderflow', '/reviews', '/customers', '/marketing', '/shared'];
const B2B_PATHS = ['/offline-sales'];

export function calendarScopeForPath(pathname: string): CalendarScope {
  if (D2C_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return 'D2C';
  if (B2B_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return 'B2B';
  return 'USER';
}

/** "2026-11-17" for D2C; "Mangsir 1, 2083 (2026-11-17)" for B2B. */
export function scopedDate(scope: CalendarScope, dateAd?: string, dateBs?: string): string {
  if (!dateAd && !dateBs) return '';
  if (scope === 'D2C') return dateAd || dateBs || '';
  if (dateAd && dateBs && dateAd !== dateBs) return `${dateBs} (${dateAd})`;
  return dateBs || dateAd || '';
}
