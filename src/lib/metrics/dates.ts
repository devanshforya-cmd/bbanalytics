/**
 * Date ranges and time buckets for metrics. Dates are AD strings (YYYY-MM-DD) in Nepal time.
 * Months follow the calendar a person picks: Nepali (BS) months by default, or AD months.
 */
import { adToBs, bsToAd, getTodayAd, NEPALI_MONTHS } from '../nepali-calendar';

export type CalendarMode = 'BS' | 'AD';
export type RangePreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'last90' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';
export type Bucket = 'day' | 'week' | 'month';
export type CompareMode = 'previous' | 'year' | 'off';

export interface DateRange { fromAd: string; toAd: string; label: string }

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: 'Today', yesterday: 'Yesterday', last7: 'Last 7 days', last30: 'Last 30 days', last90: 'Last 90 days',
  thisMonth: 'This month', lastMonth: 'Last month', thisYear: 'This year', custom: 'Custom dates',
};

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ms = (ad: string) => Date.parse(`${ad.slice(0, 10)}T00:00:00Z`);
export const addDaysAd = (ad: string, days: number) => iso(ms(ad) + days * DAY);
export const daysBetweenAd = (fromAd: string, toAd: string) => Math.round((ms(toAd) - ms(fromAd)) / DAY);
const bs = (ad: string) => adToBs(`${ad.slice(0, 10)}T12:00:00`);
const bsToIso = (year: number, month: number, day: number) => { const d = bsToAd(year, month, day); return iso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };

/** First and last AD day of the BS month a date falls in. */
export function bsMonthBounds(ad: string): { fromAd: string; toAd: string; year: number; month: number } {
  const { year, month } = bs(ad);
  const fromAd = bsToIso(year, month, 1);
  const next = month === 12 ? bsToIso(year + 1, 1, 1) : bsToIso(year, month + 1, 1);
  return { fromAd, toAd: addDaysAd(next, -1), year, month };
}

function adMonthBounds(ad: string) {
  const [y, m] = ad.split('-').map(Number);
  return { fromAd: iso(Date.UTC(y, m - 1, 1)), toAd: iso(Date.UTC(y, m, 0)) };
}

function monthBounds(ad: string, calendar: CalendarMode) {
  return calendar === 'BS' ? bsMonthBounds(ad) : adMonthBounds(ad);
}

export function resolveRange(preset: RangePreset, calendar: CalendarMode, custom?: { fromAd?: string; toAd?: string }, today = getTodayAd()): DateRange {
  const label = RANGE_LABELS[preset];
  switch (preset) {
    case 'today': return { fromAd: today, toAd: today, label };
    case 'yesterday': { const d = addDaysAd(today, -1); return { fromAd: d, toAd: d, label }; }
    case 'last7': return { fromAd: addDaysAd(today, -6), toAd: today, label };
    case 'last30': return { fromAd: addDaysAd(today, -29), toAd: today, label };
    case 'last90': return { fromAd: addDaysAd(today, -89), toAd: today, label };
    case 'thisMonth': return { fromAd: monthBounds(today, calendar).fromAd, toAd: today, label: `${label} (${monthLabel(today, calendar)})` };
    case 'lastMonth': { const prev = monthBounds(addDaysAd(monthBounds(today, calendar).fromAd, -1), calendar); return { ...prev, label: `${label} (${monthLabel(prev.fromAd, calendar)})` }; }
    case 'thisYear': {
      if (calendar === 'BS') return { fromAd: bsToIso(bs(today).year, 1, 1), toAd: today, label: `${label} (${bs(today).year})` };
      return { fromAd: `${today.slice(0, 4)}-01-01`, toAd: today, label: `${label} (${today.slice(0, 4)})` };
    }
    case 'custom': {
      const fromAd = custom?.fromAd && /^\d{4}-\d{2}-\d{2}$/.test(custom.fromAd) ? custom.fromAd : addDaysAd(today, -29);
      const toAd = custom?.toAd && /^\d{4}-\d{2}-\d{2}$/.test(custom.toAd) && custom.toAd >= fromAd ? custom.toAd : today;
      return { fromAd, toAd, label: `${fromAd} to ${toAd}` };
    }
  }
}

/** The range to compare against: the period just before (same length, or the previous month), or the same dates a year earlier. */
export function compareRange(range: DateRange, mode: CompareMode, preset: RangePreset, calendar: CalendarMode): DateRange | null {
  if (mode === 'off') return null;
  if (mode === 'year') {
    if (calendar === 'BS') {
      const shift = (ad: string) => { const d = bs(ad); const days = (d.month === 12 && d.day > 29) ? 29 : d.day; return bsToIso(d.year - 1, d.month, Math.min(days, 30)); };
      return { fromAd: shift(range.fromAd), toAd: shift(range.toAd), label: 'Same dates last year' };
    }
    const shift = (ad: string) => `${Number(ad.slice(0, 4)) - 1}${ad.slice(4)}`.replace('-02-29', '-02-28');
    return { fromAd: shift(range.fromAd), toAd: shift(range.toAd), label: 'Same dates last year' };
  }
  if (preset === 'thisMonth' || preset === 'lastMonth') {
    const prev = monthBounds(addDaysAd(range.fromAd, -1), calendar);
    // This month so far is compared with the same number of days of last month.
    const length = daysBetweenAd(range.fromAd, range.toAd);
    const toAd = preset === 'thisMonth' ? [addDaysAd(prev.fromAd, length), prev.toAd].sort()[0] : prev.toAd;
    return { fromAd: prev.fromAd, toAd, label: preset === 'thisMonth' ? 'Same days last month' : 'Month before' };
  }
  const length = daysBetweenAd(range.fromAd, range.toAd) + 1;
  return { fromAd: addDaysAd(range.fromAd, -length), toAd: addDaysAd(range.toAd, -length), label: 'Period before' };
}

export function monthLabel(ad: string, calendar: CalendarMode): string {
  if (calendar === 'AD') return new Date(`${ad.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const d = bs(ad);
  return `${NEPALI_MONTHS[d.month - 1]?.en || d.month} ${d.year}`;
}

/** The bucket a date belongs to: its key sorts in time order. Weeks start on Sunday, as in Nepal. */
export function bucketOf(ad: string, bucket: Bucket, calendar: CalendarMode): { key: string; label: string } {
  const day = ad.slice(0, 10);
  if (bucket === 'day') return { key: day, label: new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) };
  if (bucket === 'week') {
    const start = addDaysAd(day, -new Date(`${day}T12:00:00Z`).getUTCDay());
    return { key: start, label: `Week of ${new Date(`${start}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` };
  }
  const { fromAd } = monthBounds(day, calendar);
  return { key: fromAd, label: monthLabel(day, calendar) };
}

/** Every bucket in a range, so charts show empty days as zero instead of skipping them. */
export function bucketsIn(range: { fromAd: string; toAd: string }, bucket: Bucket, calendar: CalendarMode): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const seen = new Set<string>();
  for (let day = range.fromAd; day <= range.toAd && out.length < 400; day = addDaysAd(day, bucket === 'day' ? 1 : bucket === 'week' ? 7 : 28)) {
    const b = bucketOf(day, bucket, calendar);
    if (!seen.has(b.key)) { seen.add(b.key); out.push(b); }
  }
  const last = bucketOf(range.toAd, bucket, calendar);
  if (!seen.has(last.key)) out.push(last);
  return out;
}

/** A sensible bucket for the length of a range. */
export function autoBucket(range: { fromAd: string; toAd: string }): Bucket {
  const days = daysBetweenAd(range.fromAd, range.toAd) + 1;
  return days <= 31 ? 'day' : days <= 120 ? 'week' : 'month';
}
