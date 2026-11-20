/**
 * Greeting by the time of day in Nepal (UTC+5:45), so the brief never says
 * "Good morning" at four in the afternoon.
 */
export type DayPart = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT';

export function nepalHour(now = new Date()): number {
  return new Date(now.getTime() + (5 * 60 + 45) * 60000).getUTCHours();
}

export function dayPart(now = new Date()): DayPart {
  const hour = nepalHour(now);
  if (hour >= 5 && hour < 12) return 'MORNING';
  if (hour >= 12 && hour < 17) return 'AFTERNOON';
  if (hour >= 17 && hour < 21) return 'EVENING';
  return 'NIGHT';
}

export const GREETING: Record<DayPart, { hello: string; brief: string }> = {
  MORNING: { hello: 'Good morning', brief: 'Morning brief' },
  AFTERNOON: { hello: 'Good afternoon', brief: 'Afternoon check-in' },
  EVENING: { hello: 'Good evening', brief: 'Evening wrap-up' },
  NIGHT: { hello: 'Working late', brief: 'Night check-in' },
};
