import { describe, it, expect } from 'vitest';
import { affectedPeriods, recomputeAll } from '@main/analysis/restate';
import type { SpendingTransaction } from '@main/analysis/spending';

const tx = (id: string, amountMinor: number, categoryId: string, postedDate: string) => ({
  id,
  amountMinor,
  categoryId,
  settlementState: 'posted' as const,
  isInternalTransfer: false,
  reversesTransactionId: null,
  postedDate,
});

describe('restatement scope (FR-015, FR-077)', () => {
  it('identifies every period a corrected transaction touches', () => {
    const periods = affectedPeriods(['2026-03-15', '2026-08-02'], 'America/New_York');
    expect(periods.months).toContain('2026-03');
    expect(periods.months).toContain('2026-08');
  });

  it('deduplicates periods when several corrections fall in one month', () => {
    const periods = affectedPeriods(['2026-08-02', '2026-08-19', '2026-08-27'], 'America/New_York');
    expect(periods.months.filter((m) => m === '2026-08')).toHaveLength(1);
  });

  it('returns nothing for no corrections', () => {
    expect(affectedPeriods([], 'America/New_York').months).toHaveLength(0);
  });
});

describe('derived data is fully recomputable (SC-010, SC-013)', () => {
  const transactions: (SpendingTransaction & { postedDate: string })[] = [
    tx('a', -4312, 'groceries', '2026-08-02'),
    tx('b', -1247, 'dining', '2026-08-05'),
    tx('c', -8800, 'groceries', '2026-08-19'),
  ];

  it('recomputes byte-identical results from the same source data', () => {
    const first = recomputeAll(transactions);
    const second = recomputeAll(transactions);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('reflects a correction in the recomputed totals', () => {
    const before = recomputeAll(transactions);
    const corrected = transactions.map((t) => (t.id === 'c' ? { ...t, categoryId: 'dining' } : t));
    const after = recomputeAll(corrected);
    const groceriesBefore = before.byCategory['groceries'] ?? 0;
    const groceriesAfter = after.byCategory['groceries'] ?? 0;
    expect(groceriesAfter).toBeGreaterThan(groceriesBefore); // less negative
    expect(after.totalMinor).toBe(before.totalMinor); // total unchanged
  });

  it('keeps the reconciliation invariant after restatement (SC-004)', () => {
    const r = recomputeAll(transactions);
    const sum = Object.values(r.byCategory).reduce((a, b) => a + b, 0);
    expect(sum).toBe(r.totalMinor);
  });
});
