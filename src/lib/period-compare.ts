/**
 * "Compare with" on the dashboard: the last 30 days against the same 30 days a month or a year
 * earlier. Every comparison figure on screen comes from these two windows.
 */
export type CompareMode = 'OFF' | 'LAST_MONTH' | 'SAME_MONTH_LAST_YEAR';

export interface DateWindow { from: string; to: string }

const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

export function compareWindows(mode: CompareMode, todayAd: string): { current: DateWindow; previous: DateWindow } | null {
  if (mode === 'OFF') return null;
  const end = Date.parse(`${todayAd}T00:00:00Z`);
  const current = { from: iso(end - 29 * 86400000), to: todayAd };
  const shift = (date: string) => {
    const value = new Date(`${date}T00:00:00Z`);
    if (mode === 'LAST_MONTH') value.setUTCMonth(value.getUTCMonth() - 1);
    else value.setUTCFullYear(value.getUTCFullYear() - 1);
    return value.toISOString().slice(0, 10);
  };
  return { current, previous: { from: shift(current.from), to: shift(current.to) } };
}

export function inWindow(dateAd: string | undefined, window: DateWindow): boolean {
  const day = (dateAd || '').slice(0, 10);
  return day >= window.from && day <= window.to;
}

/** "+12%", "-8%", "New" or "No change", for a figure now against before. */
export function changeLabel(now: number, before: number): { text: string; direction: 'up' | 'down' | 'flat' } {
  if (now === before) return { text: 'No change', direction: 'flat' };
  if (before === 0) return { text: 'New', direction: 'up' };
  const pct = Math.round(((now - before) / before) * 100);
  return { text: `${pct > 0 ? '+' : ''}${pct}%`, direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

export const COMPARE_LABEL: Record<Exclude<CompareMode, 'OFF'>, string> = {
  LAST_MONTH: 'the same 30 days last month',
  SAME_MONTH_LAST_YEAR: 'the same 30 days last year',
};
