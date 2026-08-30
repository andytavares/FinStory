import { describe, it, expect } from 'vitest';
import { isSpending, spendingTotalMinor, breakdownByCategory } from '@main/analysis/spending';
import type { SpendingTransaction } from '@main/analysis/spending';

function t(o: Partial<SpendingTransaction> = {}): SpendingTransaction {
  return {
    id: 'txn_1',
    amountMinor: -1000,
    categoryId: 'groceries',
    settlementState: 'posted',
    isInternalTransfer: false,
    reversesTransactionId: null,
    ...o,
  };
}

describe('spending predicate: the single definition (Constitution II)', () => {
  it('counts ordinary spending', () => {
    expect(isSpending(t())).toBe(true);
  });

  it('excludes removed transactions', () => {
    expect(isSpending(t({ settlementState: 'removed' }))).toBe(false);
  });

  it('excludes internal transfers (FR-007)', () => {
    expect(isSpending(t({ isInternalTransfer: true }))).toBe(false);
  });

  it('excludes income', () => {
    expect(isSpending(t({ amountMinor: 500000 }))).toBe(false);
  });

  it('includes pending transactions — they are real spending', () => {
    expect(isSpending(t({ settlementState: 'pending' }))).toBe(true);
  });
});

describe('spending totals net refunds (FR-008)', () => {
  it('nets a refund against its original', () => {
    const txs = [
      t({ id: 'txn_buy', amountMinor: -5000 }),
      t({ id: 'txn_refund', amountMinor: 5000, reversesTransactionId: 'txn_buy' }),
    ];
    expect(spendingTotalMinor(txs)).toBe(0);
  });

  it('nets a partial refund', () => {
    const txs = [
      t({ id: 'txn_buy', amountMinor: -5000 }),
      t({ id: 'txn_refund', amountMinor: 2000, reversesTransactionId: 'txn_buy' }),
    ];
    expect(spendingTotalMinor(txs)).toBe(-3000);
  });

  it('ignores a refund whose original is not in the window', () => {
    const txs = [t({ id: 'txn_refund', amountMinor: 2000, reversesTransactionId: 'txn_gone' })];
    expect(spendingTotalMinor(txs)).toBe(2000);
  });
});

describe('breakdown reconciles exactly (FR-018, SC-004)', () => {
  it('category totals sum to the overall total, to the cent', () => {
    const txs = [
      t({ id: 'a', amountMinor: -4312, categoryId: 'groceries' }),
      t({ id: 'b', amountMinor: -1247, categoryId: 'groceries' }),
      t({ id: 'c', amountMinor: -3175, categoryId: 'dining' }),
      t({ id: 'd', amountMinor: -899, categoryId: 'dining' }),
      t({ id: 'e', amountMinor: -12000, categoryId: 'rent' }),
      t({ id: 'f', amountMinor: 250000, categoryId: 'income' }),
      t({ id: 'g', amountMinor: -99999, isInternalTransfer: true, categoryId: 'transfer' }),
      t({ id: 'h', amountMinor: -5000, settlementState: 'removed', categoryId: 'dining' }),
      t({ id: 'i', amountMinor: 1000, reversesTransactionId: 'a', categoryId: 'groceries' }),
    ];
    const b = breakdownByCategory(txs);
    const sumOfRows = b.rows.reduce((acc, r) => acc + r.totalMinor, 0);
    expect(sumOfRows).toBe(b.totalMinor);
    // Ground truth: (4312+1247-1000) + (3175+899) + 12000 = 4559 + 4074 + 12000
    expect(b.totalMinor).toBe(-(4559 + 4074 + 12000));
  });

  it('reconciles over a large set', () => {
    const txs = Array.from({ length: 2847 }, (_, i) =>
      t({ id: `txn_${i}`, amountMinor: -1247, categoryId: `cat_${i % 17}` }),
    );
    const b = breakdownByCategory(txs);
    expect(b.rows.reduce((a, r) => a + r.totalMinor, 0)).toBe(b.totalMinor);
    expect(b.totalMinor).toBe(-1247 * 2847);
  });

  it('produces an empty breakdown with a zero total for no transactions', () => {
    const b = breakdownByCategory([]);
    expect(b.rows).toHaveLength(0);
    expect(b.totalMinor).toBe(0);
  });
});
