import { normalizeMerchantKey } from '@main/categorization/local';
import { importId } from './index';
import type { ImportedTransaction } from './types';

const DUPLICATE_WINDOW_DAYS = 3;
const DAY_MS = 86_400_000;

export interface ExistingTransaction {
  readonly accountId: string;
  readonly plaidTransactionId: string;
  readonly amountMinor: number;
  readonly postedDate: string;
  readonly merchantKey: string | null;
}

export interface PlannedRow {
  readonly transaction: ImportedTransaction;
  /** Becomes `plaid_transaction_id`. */
  readonly id: string;
  readonly duplicate: boolean;
}

function similarPayee(a: string, b: string): boolean {
  return a !== '' && b !== '' && (a === b || a.includes(b) || b.includes(a));
}

function isSameCharge(row: ImportedTransaction, existing: ExistingTransaction): boolean {
  const days = Math.abs(Date.parse(row.date) - Date.parse(existing.postedDate)) / DAY_MS;
  return (
    existing.amountMinor === row.amountMinor &&
    days <= DUPLICATE_WINDOW_DAYS &&
    similarPayee(normalizeMerchantKey(row.payee), existing.merchantKey ?? '')
  );
}

/** Two identical purchases on one day share an importId; the repeat gets a stable suffix. */
function uniqueIds(rows: readonly ImportedTransaction[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = importId(row);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}:${n}`;
  });
}

/**
 * A row is a duplicate when its id is already stored, or when the target account
 * holds a charge with the same amount, within 3 days, from a similar payee.
 * Each stored charge matches at most one row. `accountIdFor` is null for new accounts.
 */
export function planRows(
  rows: readonly ImportedTransaction[],
  accountIdFor: (label: string) => string | null,
  existing: readonly ExistingTransaction[],
): PlannedRow[] {
  const storedIds = new Set(existing.map((e) => e.plaidTransactionId));
  const matched = new Set<ExistingTransaction>();
  const ids = uniqueIds(rows);
  return rows.map((transaction, index) => {
    const id = ids[index] ?? '';
    if (storedIds.has(id)) return { transaction, id, duplicate: true };
    const accountId = accountIdFor(transaction.accountLabel);
    const twin = existing.find(
      (e) => e.accountId === accountId && !matched.has(e) && isSameCharge(transaction, e),
    );
    if (twin) matched.add(twin);
    return { transaction, id, duplicate: twin !== undefined };
  });
}
