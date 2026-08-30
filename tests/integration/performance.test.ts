import { describe, it, expect } from 'vitest';
import { breakdownByCategory, spendingTotalMinor } from '@main/analysis/spending';
import { detectRecurringCharges } from '@main/analysis/recurring';
import type { SpendingTransaction } from '@main/analysis/spending';
import type { RecurringObservation } from '@main/analysis/recurring';

/**
 * SC-020: navigating, filtering, and drilling through the full retained history
 * feels immediate. 24 months at ~350/month is ~8,400 transactions; this uses
 * 10,000 to leave headroom.
 *
 * Thresholds are deliberately loose. This test exists to catch an accidental
 * O(n^2) — the kind of regression that only shows up at full history — not to
 * benchmark the machine it runs on.
 */

const COUNT = 10_000;

function corpus(): SpendingTransaction[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    id: `txn_${i}`,
    amountMinor: -(1000 + (i % 900)),
    categoryId: `cat_${i % 30}`,
    settlementState: 'posted' as const,
    isInternalTransfer: i % 97 === 0,
    reversesTransactionId: i % 211 === 0 ? `txn_${i - 1}` : null,
  }));
}

describe('performance across a full 24-month history (SC-020)', () => {
  const transactions = corpus();

  it('builds a category breakdown well inside an interactive budget', () => {
    const start = performance.now();
    const b = breakdownByCategory(transactions);
    const elapsed = performance.now() - start;
    expect(b.rows.length).toBe(30);
    expect(elapsed, `breakdown took ${elapsed.toFixed(0)}ms`).toBeLessThan(500);
  });

  it('still reconciles exactly at full scale (SC-004)', () => {
    const b = breakdownByCategory(transactions);
    expect(b.rows.reduce((a, r) => a + r.totalMinor, 0)).toBe(b.totalMinor);
  });

  it('computes a spending total quickly', () => {
    const start = performance.now();
    spendingTotalMinor(transactions);
    expect(performance.now() - start).toBeLessThan(300);
  });

  it('detects recurring charges across many merchants without blowing up', () => {
    const observations: RecurringObservation[] = Array.from({ length: 5_000 }, (_, i) => ({
      transactionId: `txn_${i}`,
      merchantKey: `merchant_${i % 200}`,
      amountMinor: -1599,
      occurredAt: new Date(2024, 0, 1 + Math.floor(i / 200) * 30),
    }));
    const start = performance.now();
    detectRecurringCharges(observations);
    const elapsed = performance.now() - start;
    expect(elapsed, `detection took ${elapsed.toFixed(0)}ms`).toBeLessThan(2000);
  });
});
