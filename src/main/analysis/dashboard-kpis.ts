import { spendingTotalMinor, type SpendingTransaction } from './spending';

/**
 * Figures the dashboard and the income screen read at a glance.
 *
 * Pure over passed-in data. Months are calendar months in UTC and money out is
 * reported as a positive amount, like `trends:overTime`.
 */

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

/** Oldest first, ending with the month of `now`. */
export function monthlyTotals(
  transactions: readonly DatedTransaction[],
  now: Date,
  months = MONTHS_SHOWN,
): MonthTotals[] {
  return Array.from({ length: months }, (_, index) => {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - index), 1));
    const month = isoDay(first).slice(0, 7);
    const inMonth = transactions.filter((tx) => tx.postedDate.startsWith(month));
    return {
      month,
      incomeMinor: inMonth
        .filter((tx) => tx.amountMinor > 0 && !tx.isInternalTransfer)
        .reduce((total, tx) => total + tx.amountMinor, 0),
      spendingMinor: 0 - spendingTotalMinor(inMonth),
    };
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
