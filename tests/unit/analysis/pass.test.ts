import { describe, it, expect } from 'vitest';
import { runAnalysisPass } from '@main/analysis/pass';
import type { AnalysisInput } from '@main/analysis/pass';
import { series, irregular } from '../../fixtures/builders';

const NOW = new Date('2026-08-29T12:00:00Z');

function txns(
  key: string,
  points: ReturnType<typeof series>,
  sign: -1 | 1,
): AnalysisInput['transactions'] {
  return points.map((p, i) => ({
    id: `txn_${key}_${i}`,
    accountId: 'acct_1',
    merchantKey: key,
    amountMinor: sign * Math.abs(p.amountMinor),
    postedDate: p.occurredAt.toISOString().slice(0, 10),
    datetime: p.occurredAt.toISOString(),
    isInternalTransfer: false,
    settlementState: 'posted' as const,
    userRecurringOverride: null,
  }));
}

const base: AnalysisInput = {
  transactions: [],
  existingRecurring: [],
  existingIncome: [],
  asOf: NOW,
};

describe('analysis pass finds recurring charges', () => {
  it('detects a monthly subscription from the transaction history', () => {
    const result = runAnalysisPass({
      ...base,
      transactions: txns(
        'netflix',
        series({ start: '2026-01-15', count: 8, everyDays: 30, amountMinor: 1599 }),
        -1,
      ),
    });
    expect(result.recurring).toHaveLength(1);
    expect(result.recurring[0]?.merchantKey).toBe('netflix');
    expect(result.recurring[0]?.cadence).toBe('monthly');
    expect(result.newlyDetected.map((r) => r.merchantKey)).toContain('netflix');
  });

  it('does not invent a subscription from irregular purchases', () => {
    const result = runAnalysisPass({
      ...base,
      transactions: txns(
        'trader-joes',
        irregular({
          start: '2026-01-01',
          offsetsDays: [0, 3, 4, 11, 13, 20, 27, 28, 40, 41],
          amountsMinor: [4312, 11890, 2201, 7654, 9903],
        }),
        -1,
      ),
    });
    expect(result.recurring).toHaveLength(0);
  });

  it('respects a user marking something not recurring', () => {
    const transactions = txns(
      'netflix',
      series({ start: '2026-01-15', count: 8, everyDays: 30, amountMinor: 1599 }),
      -1,
    ).map((t) => ({ ...t, userRecurringOverride: 'not_recurring' as const }));
    expect(runAnalysisPass({ ...base, transactions }).recurring).toHaveLength(0);
  });

  it('excludes internal transfers from detection', () => {
    const transactions = txns(
      'savings',
      series({ start: '2026-01-15', count: 8, everyDays: 30, amountMinor: 50_000 }),
      -1,
    ).map((t) => ({ ...t, isInternalTransfer: true }));
    expect(runAnalysisPass({ ...base, transactions }).recurring).toHaveLength(0);
  });

  it('reports a price change against the stored ledger', () => {
    const result = runAnalysisPass({
      ...base,
      transactions: txns(
        'netflix',
        series({ start: '2026-01-15', count: 8, everyDays: 30, amountMinor: 1899 }),
        -1,
      ),
      existingRecurring: [
        {
          id: 'rc_1',
          merchantKey: 'netflix',
          currentAmountMinor: -1599,
          cadence: 'monthly',
          firstSeenDate: new Date('2026-01-15'),
          lastSeenDate: new Date('2026-07-15'),
          cumulativePaidMinor: -11_193,
          status: 'active',
          userAcknowledged: true,
        },
      ],
    });
    expect(result.amountChanges[0]?.oldAmountMinor).toBe(-1599);
    expect(result.amountChanges[0]?.newAmountMinor).toBe(-1899);
    // Already known, so not reported as new.
    expect(result.newlyDetected).toHaveLength(0);
  });
});

describe('analysis pass finds income', () => {
  it('detects a biweekly paycheck', () => {
    const result = runAnalysisPass({
      ...base,
      transactions: txns(
        'acme-payroll',
        series({ start: '2026-01-02', count: 10, everyDays: 14, amountMinor: 260_000 }),
        1,
      ),
    });
    expect(result.income).toHaveLength(1);
    expect(result.income[0]?.cadence).toBe('biweekly');
  });

  it('keeps a user-confirmed income source rather than re-deriving over it', () => {
    const result = runAnalysisPass({
      ...base,
      transactions: txns(
        'acme-payroll',
        series({ start: '2026-01-02', count: 10, everyDays: 14, amountMinor: 260_000 }),
        1,
      ),
      existingIncome: [
        {
          id: 'inc_1',
          accountId: 'acct_1',
          merchantKey: 'acme-payroll',
          expectedAmountMinor: 300_000,
          cadence: 'monthly',
          nextExpectedDate: new Date('2026-09-01'),
          detectionConfidence: 0.4,
          isUserConfirmed: true,
          isActive: true,
        },
      ],
    });
    const acme = result.income.find((i) => i.merchantKey === 'acme-payroll');
    expect(acme?.isUserConfirmed).toBe(true);
    expect(acme?.expectedAmountMinor).toBe(300_000);
  });

  it('does not treat spending as income', () => {
    const result = runAnalysisPass({
      ...base,
      transactions: txns(
        'rent',
        series({ start: '2026-01-01', count: 8, everyDays: 30, amountMinor: 120_000 }),
        -1,
      ),
    });
    expect(result.income).toHaveLength(0);
  });
});

describe('analysis pass is safe on empty and partial data', () => {
  it('returns empty results for no transactions', () => {
    const r = runAnalysisPass(base);
    expect(r.recurring).toHaveLength(0);
    expect(r.income).toHaveLength(0);
    expect(r.newlyDetected).toHaveLength(0);
  });

  it('deactivates a charge that has stopped', () => {
    const r = runAnalysisPass({
      ...base,
      existingRecurring: [
        {
          id: 'rc_1',
          merchantKey: 'gone',
          currentAmountMinor: -1000,
          cadence: 'monthly',
          firstSeenDate: new Date('2026-01-01'),
          lastSeenDate: new Date('2026-03-01'),
          cumulativePaidMinor: -3000,
          status: 'active',
          userAcknowledged: true,
        },
      ],
    });
    expect(r.deactivated.map((d) => d.merchantKey)).toContain('gone');
  });
});
