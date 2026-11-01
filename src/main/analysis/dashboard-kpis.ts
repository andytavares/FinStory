import { spendingTotalMinor, type SpendingTransaction } from './spending';

// Figures the dashboard and income screen read at a glance. Pure over passed-in data.
// Months are calendar months in UTC; money out is a positive amount, like `trends:overTime`.

export interface DatedTransaction extends SpendingTransaction {
  readonly postedDate: string;
}

export interface MonthTotals {
  readonly month: string;
  readonly incomeMinor: number;
  readonly spendingMinor: number;
}

export interface Runway {
  readonly available: boolean;
  readonly currentBalanceMinor: number;
  readonly projectedMinor: number | null;
  readonly floorMinor: number;
  readonly dailyBurnMinor: number;
  readonly nextIncomeDate: string | null;
  readonly reason: string;
}

export interface RunwayPoint {
  readonly date: string;
  readonly balanceMinor: number;
}

const DAY_MS = 86_400_000;
export const MONTHS_SHOWN = 6;

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/** Whole days from `now` to `date`, rounded up and never negative. */
export function daysUntil(date: Date, now: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY_MS));
}

export function monthRange(now: Date, monthsBack = 0): { start: string; end: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: isoDay(start), end: isoDay(end) };
}

export type DashboardPeriod = 'week' | 'month' | 'year';

export interface PeriodTotals {
  /** First day of the bucket, `YYYY-MM-DD`. Weeks start on Monday (UTC). */
  readonly start: string;
  readonly incomeMinor: number;
  readonly spendingMinor: number;
}

/** Start of the bucket `back` buckets before the one holding `now`; negative `back` looks forward. */
function bucketStart(now: Date, period: DashboardPeriod, back: number): Date {
  const [year, month, day] = [now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()];
  if (period === 'year') return new Date(Date.UTC(year - back, 0, 1));
  if (period === 'month') return new Date(Date.UTC(year, month - back, 1));
  const sinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(year, month, day - sinceMonday - back * 7));
}

/** The dates a series of `count` buckets covers: `end` is the first day after the last bucket. */
export function periodSpan(now: Date, period: DashboardPeriod, count = MONTHS_SHOWN): { start: string; end: string } {
  return { start: isoDay(bucketStart(now, period, count - 1)), end: isoDay(bucketStart(now, period, -1)) };
}

/** Oldest first, ending with the bucket of `now`. */
export function periodTotals(
  transactions: readonly DatedTransaction[],
  series: { now: Date; period: DashboardPeriod; count?: number },
): PeriodTotals[] {
  const { now, period, count = MONTHS_SHOWN } = series;
  return Array.from({ length: count }, (_, index) => {
    const start = isoDay(bucketStart(now, period, count - 1 - index));
    const end = isoDay(bucketStart(now, period, count - 2 - index));
    const inBucket = transactions.filter((tx) => tx.postedDate >= start && tx.postedDate < end);
    return {
      start,
      incomeMinor: inBucket
        .filter((tx) => tx.amountMinor > 0 && !tx.isInternalTransfer)
        .reduce((total, tx) => total + tx.amountMinor, 0),
      spendingMinor: 0 - spendingTotalMinor(inBucket),
    };
  });
}

/** Oldest first, ending with the month of `now`. */
export function monthlyTotals(
  transactions: readonly DatedTransaction[],
  now: Date,
  months = MONTHS_SHOWN,
): MonthTotals[] {
  return periodTotals(transactions, { now, period: 'month', count: months }).map(({ start, ...totals }) => ({
    month: start.slice(0, 7),
    ...totals,
  }));
}

export interface RecurringSpan {
  readonly monthlyMinor: number;
  readonly firstSeenDate: string;
  readonly lastSeenDate: string;
  readonly active: boolean;
}

/** Monthly recurring cost per month, oldest first. A charge counts from its first-seen month; an inactive one stops after its last-seen month. */
export function recurringSeries(charges: readonly RecurringSpan[], now: Date, months = MONTHS_SHOWN): number[] {
  return Array.from({ length: months }, (_, index) => {
    const start = isoDay(bucketStart(now, 'month', months - 1 - index));
    const end = isoDay(bucketStart(now, 'month', months - 2 - index));
    return charges
      .filter((c) => c.firstSeenDate < end && (c.active || c.lastSeenDate >= start))
      .reduce((total, c) => total + c.monthlyMinor, 0);
  });
}

/** What can be spent each day until payday and still stay above the floor. */
export function safeToSpendPerDayMinor(runway: Runway, now: Date): number | null {
  if (!runway.available || runway.projectedMinor === null || !runway.nextIncomeDate) return null;
  const days = daysUntil(new Date(runway.nextIncomeDate), now);
  if (days === 0) return null;
  return Math.floor(Math.max(0, runway.projectedMinor - runway.floorMinor) / days);
}

export function runwaySeries(
  runway: Runway,
  now: Date,
): { points: RunwayPoint[]; floorMinor: number } | null {
  if (!runway.available || !runway.nextIncomeDate) return null;
  const days = daysUntil(new Date(runway.nextIncomeDate), now);
  const points = Array.from({ length: days + 1 }, (_, day) => ({
    date: isoDay(new Date(now.getTime() + day * DAY_MS)),
    balanceMinor: runway.currentBalanceMinor - runway.dailyBurnMinor * day,
  }));
  return { points, floorMinor: runway.floorMinor };
}

export interface GroupSpend {
  readonly groupId: string;
  readonly name: string;
  readonly spentMinor: number;
}

/** Rolls category totals (negative = spending) up to their top-level group, largest first. */
export function spendByGroup(
  rows: ReadonlyArray<{ categoryId: string; totalMinor: number }>,
  names: ReadonlyMap<string, string>,
  parents: ReadonlyMap<string, string | null>,
): GroupSpend[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const groupId = parents.get(row.categoryId) ?? row.categoryId;
    totals.set(groupId, (totals.get(groupId) ?? 0) - row.totalMinor);
  }
  return [...totals.entries()]
    .map(([groupId, spentMinor]) => ({ groupId, name: names.get(groupId) ?? groupId, spentMinor }))
    .sort((a, b) => b.spentMinor - a.spentMinor);
}
