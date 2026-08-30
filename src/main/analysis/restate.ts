import { breakdownByCategory } from './spending';
import type { SpendingTransaction } from './spending';

/**
 * Restatement after a correction.
 *
 * Because every derived value is recomputable from transactions and
 * categorizations (data-model.md), restatement is a pure recomputation rather
 * than a destructive migration. That is what makes FR-015, FR-042, FR-077 and
 * SC-010 achievable rather than aspirational.
 */

export interface AffectedPeriods {
  readonly months: string[];
  readonly weeks: string[];
}

/** Periods whose derived figures must be regenerated after a correction. */
export function affectedPeriods(postedDates: readonly string[], _timeZone: string): AffectedPeriods {
  const months = new Set<string>();
  const weeks = new Set<string>();
  for (const d of postedDates) {
    const date = new Date(d);
    months.add(d.slice(0, 7));
    // ISO week key, sufficient to identify which weekly digest to regenerate.
    const week = new Date(date);
    week.setUTCDate(week.getUTCDate() - week.getUTCDay());
    weeks.add(week.toISOString().slice(0, 10));
  }
  return { months: [...months].sort(), weeks: [...weeks].sort() };
}

export interface RecomputedTotals {
  readonly byCategory: Record<string, number>;
  readonly totalMinor: number;
}

/**
 * Recompute totals from source data.
 *
 * Deterministic by construction: same input, same output. The test asserting
 * byte-identical repeat output is what keeps every derived figure honest.
 */
export function recomputeAll(transactions: readonly SpendingTransaction[]): RecomputedTotals {
  const breakdown = breakdownByCategory(transactions);
  const byCategory: Record<string, number> = {};
  // Sorted insertion so serialization is stable across runs.
  for (const row of [...breakdown.rows].sort((a, b) => a.categoryId.localeCompare(b.categoryId))) {
    byCategory[row.categoryId] = row.totalMinor;
  }
  return { byCategory, totalMinor: breakdown.totalMinor };
}
