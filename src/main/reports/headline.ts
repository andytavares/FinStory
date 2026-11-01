import { spendingTotalMinor } from '@main/analysis/spending';
import type { DatedTransaction } from '@main/analysis/dashboard-kpis';

/** Plain-language summary and sparkline data for a stored report. */

interface StoredContent {
  readonly totalSpendingMinor?: number;
  readonly categoryTotals?: ReadonlyArray<{ totalMinor: number }>;
}

const DAY_MS = 86_400_000;
/** A change smaller than this is not worth calling above or below. */
const IN_LINE_PERCENT = 5;

/** Money out in the report, positive. Weekly digests carry category totals instead of a total. */
export function reportSpentMinor(content: StoredContent): number {
  if (content.totalSpendingMinor !== undefined) return Math.abs(content.totalSpendingMinor);
  return Math.abs((content.categoryTotals ?? []).reduce((total, row) => total + row.totalMinor, 0));
}

const dollars = (minor: number): string => `$${Math.round(minor / 100).toLocaleString('en-US')}`;

export function reportHeadline(spentMinor: number, otherPeriodsMinor: readonly number[]): string {
  const base = `You spent ${dollars(spentMinor)}`;
  if (otherPeriodsMinor.length === 0) return base;
  const average = otherPeriodsMinor.reduce((total, minor) => total + minor, 0) / otherPeriodsMinor.length;
  if (average === 0) return base;
  const percent = Math.round((spentMinor / average - 1) * 100);
  if (Math.abs(percent) < IN_LINE_PERCENT) return `${base}, in line with your average`;
  return `${base}, ${Math.abs(percent)}% ${percent > 0 ? 'above' : 'below'} your average`;
}

/** Spending for each day from `periodStart` up to, not including, `periodEnd`. */
export function dailySpending(
  periodStart: string,
  periodEnd: string,
  transactions: readonly DatedTransaction[],
): number[] {
  const first = Date.parse(`${periodStart.slice(0, 10)}T00:00:00Z`);
  const last = Date.parse(`${periodEnd.slice(0, 10)}T00:00:00Z`);
  const days = Math.max(0, Math.round((last - first) / DAY_MS));
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(first + index * DAY_MS).toISOString().slice(0, 10);
    return 0 - spendingTotalMinor(transactions.filter((tx) => tx.postedDate === day));
  });
}
