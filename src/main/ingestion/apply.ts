import { toMinor } from '@shared/money';
import { normalizeMerchantKey } from '@main/categorization/local';

/**
 * Applying a /transactions/sync page.
 *
 * The endpoint's added/modified/removed semantics map directly onto FR-005,
 * FR-006 and FR-008 (research.md R2), so this module is mostly about honoring
 * them exactly: insert once, update in place, never delete.
 */

export interface PlaidTransactionLike {
  readonly transaction_id: string;
  readonly account_id: string;
  /** Plaid convention: POSITIVE means money out. Inverted on the way in. */
  readonly amount: number;
  readonly iso_currency_code: string | null;
  readonly unofficial_currency_code: string | null;
  readonly merchant_name: string | null;
  readonly name: string;
  readonly date: string;
  readonly datetime: string | null;
  readonly pending: boolean;
}

export interface StoredTransaction {
  readonly id: string;
  readonly plaidTransactionId: string;
  readonly accountId: string;
  /** Settled amount. Negative = money out. Authoritative for all math (FR-084). */
  readonly amountMinor: number;
  readonly merchantName: string | null;
  readonly merchantKey: string;
  readonly description: string;
  readonly postedDate: string;
  readonly datetime: string | null;
  readonly pending: boolean;
  readonly settlementState: 'pending' | 'posted' | 'removed';
  readonly isInternalTransfer: boolean;
  readonly reversesTransactionId: string | null;
  /** Display-only (FR-085, FR-086). */
  readonly originalCurrency: string | null;
  readonly originalAmountMinor: number | null;
}

export interface ForeignCurrencyContext {
  readonly accountCurrency: string;
  readonly originalAmountMinor: number;
}

export function mapPlaidTransaction(
  t: PlaidTransactionLike,
  accountId: string,
  fx?: ForeignCurrencyContext,
): StoredTransaction {
  const currency = t.iso_currency_code ?? t.unofficial_currency_code;
  const isForeign = fx !== undefined && currency !== null && currency !== fx.accountCurrency;

  return {
    id: `txn_${t.transaction_id}`,
    plaidTransactionId: t.transaction_id,
    accountId,
    // Invert: Plaid reports outflow positive, the app stores outflow negative.
    amountMinor: -toMinor(t.amount),
    merchantName: t.merchant_name,
    merchantKey: normalizeMerchantKey(t.merchant_name ?? t.name),
    description: t.merchant_name ?? t.name,
    postedDate: t.date,
    datetime: t.datetime,
    pending: t.pending,
    settlementState: t.pending ? 'pending' : 'posted',
    isInternalTransfer: false,
    reversesTransactionId: null,
    originalCurrency: isForeign ? currency : null,
    originalAmountMinor: isForeign ? fx.originalAmountMinor : null,
  };
}

export interface SyncPage {
  readonly added: readonly StoredTransaction[];
  readonly modified: readonly StoredTransaction[];
  readonly removed: readonly string[];
}

export interface ApplyResult {
  readonly transactions: StoredTransaction[];
  readonly inserted: StoredTransaction[];
  readonly updated: StoredTransaction[];
  readonly removed: StoredTransaction[];
}

export function applySyncPage(
  existing: readonly StoredTransaction[],
  page: SyncPage,
): ApplyResult {
  const byPlaidId = new Map(existing.map((t) => [t.plaidTransactionId, t]));
  const inserted: StoredTransaction[] = [];
  const updated: StoredTransaction[] = [];
  const removed: StoredTransaction[] = [];

  // `added` may legitimately contain something already stored — a retried page,
  // or a crash mid-sync. Treat it as an update, never a second row (FR-005).
  for (const t of [...page.added, ...page.modified]) {
    const prior = byPlaidId.get(t.plaidTransactionId);
    if (!prior) {
      byPlaidId.set(t.plaidTransactionId, t);
      inserted.push(t);
      continue;
    }
    // Update in place, preserving local enrichment that Plaid does not know
    // about (transfer flag, reversal linkage).
    const merged: StoredTransaction = {
      ...t,
      id: prior.id,
      isInternalTransfer: prior.isInternalTransfer,
      reversesTransactionId: prior.reversesTransactionId,
    };
    byPlaidId.set(t.plaidTransactionId, merged);
    updated.push(merged);
  }

  for (const plaidId of page.removed) {
    const prior = byPlaidId.get(plaidId);
    if (!prior) continue;
    // Retained for audit, excluded from every total (FR-008).
    const marked: StoredTransaction = { ...prior, settlementState: 'removed' };
    byPlaidId.set(plaidId, marked);
    removed.push(marked);
  }

  return { transactions: [...byPlaidId.values()], inserted, updated, removed };
}

/** Window within which an offsetting pair is treated as one transfer. */
const TRANSFER_WINDOW_MS = 3 * 86_400_000;

/**
 * Flag matched debit/credit pairs between the user's own accounts.
 *
 * Moving money between your own accounts is not spending, and counting it would
 * inflate every total (FR-007).
 */
export function detectInternalTransfers(
  transactions: readonly StoredTransaction[],
  ownAccountIds: ReadonlySet<string>,
): StoredTransaction[] {
  const candidates = transactions.filter((t) => ownAccountIds.has(t.accountId));
  const matched = new Set<string>();

  for (const debit of candidates) {
    if (debit.amountMinor >= 0 || matched.has(debit.id)) continue;
    const partner = candidates.find(
      (c) =>
        !matched.has(c.id) &&
        c.id !== debit.id &&
        c.accountId !== debit.accountId &&
        c.amountMinor === -debit.amountMinor &&
        Math.abs(timeOf(c) - timeOf(debit)) <= TRANSFER_WINDOW_MS,
    );
    if (partner) {
      matched.add(debit.id);
      matched.add(partner.id);
    }
  }

  return transactions.map((t) => (matched.has(t.id) ? { ...t, isInternalTransfer: true } : t));
}

function timeOf(t: StoredTransaction): number {
  return new Date(t.datetime ?? `${t.postedDate}T12:00:00Z`).getTime();
}
