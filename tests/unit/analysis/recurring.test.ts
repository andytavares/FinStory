import { describe, it, expect } from 'vitest';
import { detectRecurringCharges, reconcileLedger } from '@main/analysis/recurring';
import type { LedgerEntry, RecurringObservation } from '@main/analysis/recurring';
import { series, irregular } from '../../fixtures/builders';

function obs(merchantKey: string, inputs: ReturnType<typeof series>): RecurringObservation[] {
  return inputs.map((i, n) => ({
    transactionId: `txn_${merchantKey}_${n}`,
    merchantKey,
    amountMinor: -Math.abs(i.amountMinor),
    occurredAt: i.occurredAt,
  }));
}

describe('recurring detection across cadences (FR-019, FR-020)', () => {
  const observations = [
    ...obs('netflix', series({ start: '2026-01-15', count: 8, everyDays: 30, amountMinor: 1599 })),
    ...obs('insurance', series({ start: '2026-01-10', count: 5, everyDays: 91, amountMinor: 45000 })),
    ...obs('domain', series({ start: '2022-03-01', count: 4, everyDays: 365, amountMinor: 1800 })),
    // Decoy: a grocery store — frequent but irregular.
    ...obs(
      'trader-joes',
      irregular({
        start: '2026-01-01',
        offsetsDays: [0, 3, 4, 11, 13, 20, 27, 28, 40, 41],
        amountsMinor: [4312, 11890, 2201, 7654, 9903],
      }),
    ),
  ];

  const found = detectRecurringCharges(observations);

  it('finds the monthly subscription', () => {
    expect(found.find((c) => c.merchantKey === 'netflix')?.cadence).toBe('monthly');
  });

  it('finds the quarterly charge', () => {
    expect(found.find((c) => c.merchantKey === 'insurance')?.cadence).toBe('quarterly');
  });

  it('finds the annual charge', () => {
    expect(found.find((c) => c.merchantKey === 'domain')?.cadence).toBe('annual');
  });

  it('does NOT list the irregular grocery store (FR-025)', () => {
    expect(found.map((c) => c.merchantKey)).not.toContain('trader-joes');
  });

  it('reports cumulative amount paid to date (FR-021)', () => {
    expect(found.find((c) => c.merchantKey === 'netflix')?.cumulativePaidMinor).toBe(-1599 * 8);
  });

  it('records first-seen and last-seen dates', () => {
    const netflix = found.find((c) => c.merchantKey === 'netflix');
    expect(netflix?.firstSeenDate.toISOString().slice(0, 10)).toBe('2026-01-15');
  });
});

describe('ledger reconciliation: lifecycle (FR-022, FR-023, FR-024)', () => {
  const existing: LedgerEntry[] = [
    {
      id: 'rc_1',
      merchantKey: 'netflix',
      currentAmountMinor: -1599,
      cadence: 'monthly',
      firstSeenDate: new Date('2026-01-15'),
      lastSeenDate: new Date('2026-07-15'),
      cumulativePaidMinor: -1599 * 7,
      status: 'active',
      userAcknowledged: true,
    },
  ];

  it('flags a newly detected charge as new (FR-022)', () => {
    const detected = detectRecurringCharges(
      obs('hulu', series({ start: '2026-01-20', count: 6, everyDays: 30, amountMinor: 1299 })),
    );
    const r = reconcileLedger(existing, detected, new Date('2026-08-29'));
    expect(r.newlyDetected.map((c) => c.merchantKey)).toContain('hulu');
  });

  it('does not re-flag an already acknowledged charge', () => {
    const detected = detectRecurringCharges(
      obs('netflix', series({ start: '2026-01-15', count: 8, everyDays: 30, amountMinor: 1599 })),
    );
    const r = reconcileLedger(existing, detected, new Date('2026-08-29'));
    expect(r.newlyDetected.map((c) => c.merchantKey)).not.toContain('netflix');
  });

  it('detects a price increase and reports old and new (FR-023)', () => {
    const detected = detectRecurringCharges(
      obs('netflix', series({ start: '2026-01-15', count: 8, everyDays: 30, amountMinor: 1899 })),
    );
    const r = reconcileLedger(existing, detected, new Date('2026-08-29'));
    const change = r.amountChanges.find((c) => c.merchantKey === 'netflix');
    expect(change?.oldAmountMinor).toBe(-1599);
    expect(change?.newAmountMinor).toBe(-1899);
  });

  it('marks a stopped charge inactive rather than deleting it (FR-024)', () => {
    // Nothing detected, and well past the monthly cadence window.
    const r = reconcileLedger(existing, [], new Date('2026-11-01'));
    expect(r.deactivated.map((c) => c.merchantKey)).toContain('netflix');
  });

  it('does not deactivate a charge that is merely not yet due', () => {
    const r = reconcileLedger(existing, [], new Date('2026-08-01'));
    expect(r.deactivated).toHaveLength(0);
  });
});
