import { describe, it, expect } from 'vitest';
import {
  applyCorrection,
  planRetroactive,
  applyRetroactive,
  liveCategorization,
} from '@main/categorization/corrections';
import type { CategorizationRecord } from '@main/categorization/corrections';

function rec(o: Partial<CategorizationRecord> = {}): CategorizationRecord {
  return {
    id: 'c1',
    transactionId: 'txn_1',
    categoryId: 'home',
    confidence: 0.62,
    source: 'model',
    isConfirmed: false,
    needsReview: true,
    supersededBy: null,
    createdAt: '2026-08-01T00:00:00Z',
    ...o,
  };
}

describe('correction chain preserves history (FR-015)', () => {
  it('supersedes rather than overwriting', () => {
    const before = [rec()];
    const after = applyCorrection(before, 'txn_1', 'groceries', '2026-08-29T00:00:00Z');
    expect(after).toHaveLength(2);
    expect(after.find((c) => c.id === 'c1')?.supersededBy).not.toBeNull();
  });

  it('marks the correction as user-confirmed at full confidence', () => {
    const after = applyCorrection([rec()], 'txn_1', 'groceries', '2026-08-29T00:00:00Z');
    const live = liveCategorization(after, 'txn_1');
    expect(live?.categoryId).toBe('groceries');
    expect(live?.source).toBe('user');
    expect(live?.isConfirmed).toBe(true);
    expect(live?.confidence).toBe(1);
    expect(live?.needsReview).toBe(false);
  });

  it('leaves exactly one live categorization per transaction', () => {
    let records = [rec()];
    records = applyCorrection(records, 'txn_1', 'groceries', '2026-08-29T00:00:00Z');
    records = applyCorrection(records, 'txn_1', 'dining', '2026-08-30T00:00:00Z');
    const live = records.filter((c) => c.transactionId === 'txn_1' && c.supersededBy === null);
    expect(live).toHaveLength(1);
    expect(live[0]?.categoryId).toBe('dining');
  });
});

describe('retroactive correction is opt-in and counted (FR-074, FR-075)', () => {
  const merchantTxIds = ['txn_1', 'txn_2', 'txn_3', 'txn_4'];
  const records = [
    rec({ id: 'c1', transactionId: 'txn_1' }),
    rec({ id: 'c2', transactionId: 'txn_2' }),
    // Already corrected by hand — must be protected.
    rec({ id: 'c3', transactionId: 'txn_3', categoryId: 'clothing', source: 'user', isConfirmed: true }),
    rec({ id: 'c4', transactionId: 'txn_4', categoryId: 'groceries' }),
  ];

  it('reports the affected count BEFORE applying anything', () => {
    const plan = planRetroactive(records, merchantTxIds, 'groceries');
    // txn_1 and txn_2 change; txn_3 protected; txn_4 already correct.
    expect(plan.affectedCount).toBe(2);
    expect(plan.protectedCount).toBe(1);
  });

  it('changes nothing when only planned', () => {
    planRetroactive(records, merchantTxIds, 'groceries');
    expect(records.filter((r) => r.supersededBy !== null)).toHaveLength(0);
  });

  it('NEVER overwrites a prior user confirmation (FR-076)', () => {
    const after = applyRetroactive(records, merchantTxIds, 'groceries', '2026-08-29T00:00:00Z');
    expect(liveCategorization(after, 'txn_3')?.categoryId).toBe('clothing');
  });

  it('applies to the unconfirmed ones', () => {
    const after = applyRetroactive(records, merchantTxIds, 'groceries', '2026-08-29T00:00:00Z');
    expect(liveCategorization(after, 'txn_1')?.categoryId).toBe('groceries');
    expect(liveCategorization(after, 'txn_2')?.categoryId).toBe('groceries');
  });

  it('reports which transactions were skipped as already confirmed', () => {
    const plan = planRetroactive(records, merchantTxIds, 'groceries');
    expect(plan.protectedTransactionIds).toEqual(['txn_3']);
  });
});
