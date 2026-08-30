import { describe, it, expect } from 'vitest';
import { applySyncPage, detectInternalTransfers, mapPlaidTransaction } from '@main/ingestion/apply';
import type { StoredTransaction, PlaidTransactionLike } from '@main/ingestion/apply';

const base: PlaidTransactionLike = {
  transaction_id: 'plaid_1',
  account_id: 'acct_1',
  amount: 43.12,
  iso_currency_code: 'USD',
  unofficial_currency_code: null,
  merchant_name: 'Target',
  name: 'TARGET 00023415',
  date: '2026-08-29',
  datetime: '2026-08-29T14:34:00Z',
  pending: false,
};

describe('Plaid mapping', () => {
  it('inverts Plaid sign convention: a positive Plaid amount is money out', () => {
    // Plaid reports outflow as positive; the app stores outflow as negative.
    expect(mapPlaidTransaction(base, 'acct_local').amountMinor).toBe(-4312);
  });

  it('maps a credit to a positive stored amount', () => {
    expect(mapPlaidTransaction({ ...base, amount: -2600.0 }, 'acct_local').amountMinor).toBe(260000);
  });

  it('captures foreign-currency metadata as display-only (FR-085)', () => {
    const t = mapPlaidTransaction(
      { ...base, amount: 43.12, iso_currency_code: 'EUR' },
      'acct_local',
      { accountCurrency: 'USD', originalAmountMinor: 4000 },
    );
    expect(t.amountMinor).toBe(-4312); // settled amount is authoritative
    expect(t.originalCurrency).toBe('EUR');
    expect(t.originalAmountMinor).toBe(4000);
  });

  it('leaves original currency null for a same-currency purchase (FR-084)', () => {
    const t = mapPlaidTransaction(base, 'acct_local');
    expect(t.originalCurrency).toBeNull();
    expect(t.originalAmountMinor).toBeNull();
  });

  it('falls back to the raw descriptor when merchant name is absent', () => {
    const t = mapPlaidTransaction({ ...base, merchant_name: null }, 'acct_local');
    expect(t.description).toBe('TARGET 00023415');
  });
});

describe('sync page application (FR-005, FR-006, FR-008)', () => {
  const existing: StoredTransaction[] = [
    {
      id: 'txn_1',
      plaidTransactionId: 'plaid_1',
      accountId: 'acct_local',
      amountMinor: -4312,
      merchantName: 'Target',
      merchantKey: 'target',
      description: 'TARGET',
      postedDate: '2026-08-29',
      datetime: '2026-08-29T14:34:00Z',
      pending: true,
      settlementState: 'pending',
      isInternalTransfer: false,
      reversesTransactionId: null,
      originalCurrency: null,
      originalAmountMinor: null,
    },
  ];

  it('inserts new transactions', () => {
    const r = applySyncPage(existing, {
      added: [mapPlaidTransaction({ ...base, transaction_id: 'plaid_2' }, 'acct_local')],
      modified: [],
      removed: [],
    });
    expect(r.inserted).toHaveLength(1);
    expect(r.transactions).toHaveLength(2);
  });

  it('is idempotent — re-applying the same page inserts nothing (FR-005)', () => {
    const page = {
      added: [mapPlaidTransaction({ ...base, transaction_id: 'plaid_2' }, 'acct_local')],
      modified: [],
      removed: [],
    };
    const once = applySyncPage(existing, page);
    const twice = applySyncPage(once.transactions, page);
    expect(twice.inserted).toHaveLength(0);
    expect(twice.transactions).toHaveLength(2);
  });

  it('updates a pending transaction IN PLACE when it posts (FR-006)', () => {
    const posted = mapPlaidTransaction({ ...base, amount: 45.0, pending: false }, 'acct_local');
    const r = applySyncPage(existing, { added: [], modified: [posted], removed: [] });
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0]?.amountMinor).toBe(-4500);
    expect(r.transactions[0]?.settlementState).toBe('posted');
    expect(r.updated).toHaveLength(1);
  });

  it('marks removed transactions without deleting them (FR-008)', () => {
    const r = applySyncPage(existing, { added: [], modified: [], removed: ['plaid_1'] });
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0]?.settlementState).toBe('removed');
  });

  it('treats an added transaction that already exists as a modification, not a duplicate', () => {
    const dupe = mapPlaidTransaction({ ...base, amount: 50 }, 'acct_local');
    const r = applySyncPage(existing, { added: [dupe], modified: [], removed: [] });
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0]?.amountMinor).toBe(-5000);
  });
});

describe('internal transfer detection (FR-007)', () => {
  const own = new Set(['acct_a', 'acct_b']);

  it('flags a matched debit/credit pair between the user own accounts', () => {
    const txs: StoredTransaction[] = [
      { ...base_stored('t1', 'acct_a', -50000, '2026-08-29T10:00:00Z') },
      { ...base_stored('t2', 'acct_b', 50000, '2026-08-29T11:00:00Z') },
    ];
    const flagged = detectInternalTransfers(txs, own);
    expect(flagged.every((t) => t.isInternalTransfer)).toBe(true);
  });

  it('does not flag an ordinary purchase', () => {
    const txs: StoredTransaction[] = [{ ...base_stored('t1', 'acct_a', -4312, '2026-08-29T10:00:00Z') }];
    expect(detectInternalTransfers(txs, own)[0]?.isInternalTransfer).toBe(false);
  });

  it('does not flag amounts that merely coincide days apart', () => {
    const txs: StoredTransaction[] = [
      { ...base_stored('t1', 'acct_a', -50000, '2026-08-20T10:00:00Z') },
      { ...base_stored('t2', 'acct_b', 50000, '2026-08-29T10:00:00Z') },
    ];
    expect(detectInternalTransfers(txs, own).every((t) => !t.isInternalTransfer)).toBe(true);
  });
});

function base_stored(id: string, accountId: string, amountMinor: number, dt: string): StoredTransaction {
  return {
    id,
    plaidTransactionId: `p_${id}`,
    accountId,
    amountMinor,
    merchantName: null,
    merchantKey: 'x',
    description: 'x',
    postedDate: dt.slice(0, 10),
    datetime: dt,
    pending: false,
    settlementState: 'posted',
    isInternalTransfer: false,
    reversesTransactionId: null,
    originalCurrency: null,
    originalAmountMinor: null,
  };
}
