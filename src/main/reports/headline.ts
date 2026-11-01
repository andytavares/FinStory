import { spendingTotalMinor } from '@main/analysis/spending';
import type { DatedTransaction } from '@main/analysis/dashboard-kpis';

/** Plain-language summary and sparkline data for a stored report. */

export interface StoredContent {
  readonly totalSpendingMinor?: number;
  readonly savingsRate?: number;
  readonly categoryTotals?: ReadonlyArray<{ totalMinor: number }>;
  readonly categoryComparisons?: ReadonlyArray<{ categoryName: string; currentMinor: number }>;
  readonly largestPurchases?: ReadonlyArray<{ merchantName: string; amountMinor: number }>;
}

export interface PriceChange {
  readonly merchantName: string;
  readonly changedAt: string;
  readonly oldAmountMinor: number;
  readonly newAmountMinor: number;
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

function largestCategorySentence(content: StoredContent): string[] {
  const total = Math.abs(content.totalSpendingMinor ?? 0);
  const [top] = [...(content.categoryComparisons ?? [])].sort(
    (a, b) => Math.abs(b.currentMinor) - Math.abs(a.currentMinor),
  );
  if (!top || total === 0) return [];
  return [`${top.categoryName} was ${Math.round((Math.abs(top.currentMinor) / total) * 100)}% of it.`];
}

function priceChangeSentences(changes: readonly PriceChange[]): string[] {
  return changes.flatMap((change) => {
    const difference = Math.abs(change.newAmountMinor) - Math.abs(change.oldAmountMinor);
    if (Math.round(Math.abs(difference) / 100) === 0) return [];
    const month = new Date(change.changedAt).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
    return [`${change.merchantName} went ${difference > 0 ? 'up' : 'down'} ${dollars(Math.abs(difference))} in ${month}.`];
  });
}

/** One to three plain sentences about a report: its biggest category, biggest purchase and price changes. */
export function reportSummary(content: StoredContent, priceChanges: readonly PriceChange[]): string {
  const [largest] = content.largestPurchases ?? [];
  return [
    ...largestCategorySentence(content),
    ...(largest ? [`${largest.merchantName} (${dollars(Math.abs(largest.amountMinor))}) was the largest single purchase.`] : []),
    ...priceChangeSentences(priceChanges),
  ].join(' ');
}
