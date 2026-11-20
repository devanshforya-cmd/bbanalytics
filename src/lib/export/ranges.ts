/**
 * Date ranges for downloads, in Nepal time. BS months and the Nepali fiscal year (Shrawan to
 * Ashadh) are worked out from the BS calendar, so "Kartik 2083" means exactly its own days.
 */
import { adToBs, bsToAd, NEPALI_MONTHS } from '../nepali-calendar';

export type RangeKey = 'THIS_BS_MONTH' | 'LAST_BS_MONTH' | 'THIS_AD_MONTH' | 'LAST_AD_MONTH' | 'LAST_30' | 'THIS_FY' | 'LAST_FY' | 'ALL' | 'CUSTOM';

export const RANGE_LABELS: Record<RangeKey, string> = {
  THIS_BS_MONTH: 'This Nepali month', LAST_BS_MONTH: 'Last Nepali month', THIS_AD_MONTH: 'This English month', LAST_AD_MONTH: 'Last English month',
  LAST_30: 'Last 30 days', THIS_FY: 'This fiscal year', LAST_FY: 'Last fiscal year', ALL: 'All time', CUSTOM: 'Pick dates',
};

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const shift = (dateAd: string, days: number) => new Date(Date.parse(`${dateAd}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export const nepalToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kathmandu' });

/** First and last AD day of a BS month. */
export function bsMonthRange(year: number, month: number): { fromAd: string; toAd: string } {
  const fromAd = iso(bsToAd(year, month, 1));
  const next = month === 12 ? bsToAd(year + 1, 1, 1) : bsToAd(year, month + 1, 1);
  return { fromAd, toAd: shift(iso(next), -1) };
}

export function resolveRange(key: RangeKey, todayAd = nepalToday(), custom: { fromAd?: string; toAd?: string } = {}): { fromAd?: string; toAd?: string; label: string } {
  const today = adToBs(`${todayAd}T12:00:00`);
  const monthName = (m: number) => NEPALI_MONTHS[m - 1]?.en || String(m);
  switch (key) {
    case 'THIS_BS_MONTH': return { ...bsMonthRange(today.year, today.month), toAd: todayAd, label: `${monthName(today.month)} ${today.year}` };
    case 'LAST_BS_MONTH': { const y = today.month === 1 ? today.year - 1 : today.year; const m = today.month === 1 ? 12 : today.month - 1; return { ...bsMonthRange(y, m), label: `${monthName(m)} ${y}` }; }
    case 'THIS_AD_MONTH': return { fromAd: `${todayAd.slice(0, 7)}-01`, toAd: todayAd, label: todayAd.slice(0, 7) };
    case 'LAST_AD_MONTH': { const first = `${todayAd.slice(0, 7)}-01`; const last = shift(first, -1); return { fromAd: `${last.slice(0, 7)}-01`, toAd: last, label: last.slice(0, 7) }; }
    case 'LAST_30': return { fromAd: shift(todayAd, -29), toAd: todayAd, label: 'last 30 days' };
    case 'THIS_FY': case 'LAST_FY': {
      // Fiscal year starts on Shrawan 1 (month 4).
      const startYear = (today.month >= 4 ? today.year : today.year - 1) - (key === 'LAST_FY' ? 1 : 0);
      const fromAd = iso(bsToAd(startYear, 4, 1));
      const toAd = key === 'THIS_FY' ? todayAd : shift(iso(bsToAd(startYear + 1, 4, 1)), -1);
      return { fromAd, toAd, label: `FY ${startYear}/${String(startYear + 1).slice(2)}` };
    }
    case 'CUSTOM': return { fromAd: custom.fromAd, toAd: custom.toAd, label: [custom.fromAd, custom.toAd].filter(Boolean).join(' to ') || 'all dates' };
    default: return { label: 'all time' };
  }
}
