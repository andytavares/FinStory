import { sumMinor } from '@shared/money';

/**
 * The single canonical definition of what counts as spending.
 *
 * Constitution II: category totals must reconcile exactly to transaction totals
 * for any period. That invariant only holds if this predicate lives in exactly
 * one place — re-deriving it per query is how breakdowns silently stop adding
 * up.
 */

export interface SpendingTransaction {
  readonly id: string;
  /** Settled amount, minor units. Negative = money out. */
  readonly amountMinor: number;
  readonly categoryId: string;
  readonly settlementState: 'pending' | 'posted' | 'removed';
  readonly isInternalTransfer: boolean;
  readonly reversesTransactionId: string | null;
}

/**
 * True when a transaction counts toward spending.
 *
 * Pending counts: the money has left. Removed does not (FR-008). Internal
 * transfers do not — moving money between your own accounts is not spending
 * (FR-007). Income does not.
 */
export function isSpending(t: SpendingTransaction): boolean {
  if (t.settlementState === 'removed') return false;
  if (t.isInternalTransfer) return false;
  return t.amountMinor < 0;
}

/** A refund is a credit that reverses an original transaction. */
function isRefund(t: SpendingTransaction): boolean {
  return (
    t.settlementState !== 'removed' &&
    !t.isInternalTransfer &&
    t.amountMinor > 0 &&
    t.reversesTransactionId !== null
  );
}

/**
 * Net spending total. Refunds offset their originals rather than counting as
 * income (FR-008).
 */
export function spendingTotalMinor(transactions: readonly SpendingTransaction[]): number {
  const spending = transactions.filter(isSpending);
  const refunds = transactions.filter(isRefund);
  return sumMinor([...spending, ...refunds].map((t) => t.amountMinor));
}

export interface BreakdownRow {
  readonly categoryId: string;
  readonly totalMinor: number;
  readonly transactionCount: number;
}

export interface Breakdown {
  readonly rows: BreakdownRow[];
  readonly totalMinor: number;
}

/**
 * Category breakdown.
 *
 * The contract — asserted by test — is that the rows sum to `totalMinor`
 * exactly. A refund is attributed to the category of the transaction it
 * reverses when that transaction is in the window, so the netting shows up in
 * the right bucket rather than distorting a different one.
 */
export function breakdownByCategory(transactions: readonly SpendingTransaction[]): Breakdown {
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const totals = new Map<string, { totalMinor: number; count: number }>();

  const attribute = (categoryId: string, amountMinor: number): void => {
    const current = totals.get(categoryId) ?? { totalMinor: 0, count: 0 };
    totals.set(categoryId, {
      totalMinor: current.totalMinor + amountMinor,
      count: current.count + 1,
    });
  };

  for (const t of transactions) {
    if (isSpending(t)) {
      attribute(t.categoryId, t.amountMinor);
    } else if (isRefund(t)) {
      const original = t.reversesTransactionId ? byId.get(t.reversesTransactionId) : undefined;
      attribute(original?.categoryId ?? t.categoryId, t.amountMinor);
    }
  }

  const rows = [...totals.entries()]
    .map(([categoryId, v]) => ({
      categoryId,
      totalMinor: v.totalMinor,
      transactionCount: v.count,
    }))
    .sort((a, b) => a.totalMinor - b.totalMinor);

  return { rows, totalMinor: sumMinor(rows.map((r) => r.totalMinor)) };
}
