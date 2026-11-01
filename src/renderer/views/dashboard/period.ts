export type DashboardPeriod = 'week' | 'month' | 'year';

export const PERIOD_OPTIONS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
] as const;

const DAY_MS = 86_400_000;

/** Days the "where it went" card looks back; keep in step with `WHERE_IT_WENT_DAYS` in the main process. */
export const LOOKBACK_LABEL: Record<DashboardPeriod, string> = {
  week: 'Last 7 days',
  month: 'Last 30 days',
  year: 'Last 365 days',
};

/** Local calendar bounds of the period holding `now`. Weeks start on Monday. */
function bounds(now: Date, period: DashboardPeriod): { start: Date; end: Date } {
  const [year, month, day] = [now.getFullYear(), now.getMonth(), now.getDate()];
  if (period === 'year') return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
  if (period === 'month') return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };
  const start = new Date(year, month, day - ((now.getDay() + 6) % 7));
  return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) };
}

export function periodRange(now: Date, period: DashboardPeriod): { periodStart: string; periodEnd: string } {
  const { start, end } = bounds(now, period);
  return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
}

/** How far through the period `now` is, from just above 0 to 1. Compared with the same stretch of the last one. */
export function elapsedFraction(now: Date, period: DashboardPeriod): number {
  const { start, end } = bounds(now, period);
  const total = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  const elapsed = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - start.getTime()) / DAY_MS) + 1;
  return elapsed / total;
}

export function periodSubtitle(now: Date, period: DashboardPeriod): string {
  const { start } = bounds(now, period);
  const day = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - start.getTime()) / DAY_MS) + 1;
  const name =
    period === 'month'
      ? now.toLocaleDateString('en-US', { month: 'long' })
      : period === 'year'
        ? String(now.getFullYear())
        : 'This week';
  return `${name} so far · ${day} ${day === 1 ? 'day' : 'days'} in`;
}
