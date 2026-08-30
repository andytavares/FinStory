import { describe, it, expect } from 'vitest';
import { detectIncomeSources, projectBalance } from '@main/analysis/income';
import type { IncomeObservation, IncomeSource } from '@main/analysis/income';
import { series, irregular } from '../../fixtures/builders';

function credits(key: string, s: ReturnType<typeof series>): IncomeObservation[] {
  return s.map((i, n) => ({
    transactionId: `txn_${key}_${n}`,
    accountId: 'acct_1',
    merchantKey: key,
    amountMinor: Math.abs(i.amountMinor),
    occurredAt: i.occurredAt,
  }));
}

describe('income detection (FR-069, FR-070)', () => {
  it('detects a biweekly paycheck', () => {
    const found = detectIncomeSources(
      credits('acme-payroll', series({ start: '2026-01-02', count: 10, everyDays: 14, amountMinor: 260000 })),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.cadence).toBe('biweekly');
    expect(found[0]?.expectedAmountMinor).toBe(260000);
  });

  it('derives the next expected date from the pattern', () => {
    const found = detectIncomeSources(
      credits('acme-payroll', series({ start: '2026-01-02', count: 10, everyDays: 14, amountMinor: 260000 })),
    );
    // Last deposit 2026-05-08; next expected two weeks later.
    expect(found[0]?.nextExpectedDate.toISOString().slice(0, 10)).toBe('2026-05-22');
  });

  it('does NOT treat irregular credits as income', () => {
    const found = detectIncomeSources(
      credits(
        'venmo-friends',
        irregular({ start: '2026-01-01', offsetsDays: [0, 5, 19, 21, 40], amountsMinor: [2000, 15000, 800, 6000, 300] }),
      ),
    );
    expect(found).toHaveLength(0);
  });

  it('ignores debits entirely', () => {
    const debits: IncomeObservation[] = series({
      start: '2026-01-02',
      count: 10,
      everyDays: 14,
      amountMinor: 260000,
    }).map((i, n) => ({
      transactionId: `d_${n}`,
      accountId: 'acct_1',
      merchantKey: 'rent',
      amountMinor: -i.amountMinor,
      occurredAt: i.occurredAt,
    }));
    expect(detectIncomeSources(debits)).toHaveLength(0);
  });

  it('detects multiple independent income sources', () => {
    const found = detectIncomeSources([
      ...credits('acme-payroll', series({ start: '2026-01-02', count: 8, everyDays: 14, amountMinor: 260000 })),
      ...credits('side-gig', series({ start: '2026-01-05', count: 6, everyDays: 30, amountMinor: 40000 })),
    ]);
    expect(found).toHaveLength(2);
  });
});

describe('balance projection withholds rather than guessing (FR-073, Constitution IX)', () => {
  const confident: IncomeSource = {
    id: 'inc_1',
    accountId: 'acct_1',
    merchantKey: 'acme-payroll',
    expectedAmountMinor: 260000,
    cadence: 'biweekly',
    nextExpectedDate: new Date('2026-09-04'),
    detectionConfidence: 0.95,
    isUserConfirmed: true,
    isActive: true,
  };

  it('projects to the next income date when income is known', () => {
    const p = projectBalance({
      currentBalanceMinor: 84700,
      dailyBurnMinor: 8700,
      asOf: new Date('2026-08-29'),
      incomeSources: [confident],
      floorMinor: 100000,
    });
    expect(p.available).toBe(true);
    expect(p.projectedMinor).toBeLessThan(84700);
    expect(p.breachesFloor).toBe(true);
  });

  it('WITHHOLDS the projection when no income source exists', () => {
    const p = projectBalance({
      currentBalanceMinor: 84700,
      dailyBurnMinor: 8700,
      asOf: new Date('2026-08-29'),
      incomeSources: [],
      floorMinor: 100000,
    });
    expect(p.available).toBe(false);
    expect(p.projectedMinor).toBeNull();
    expect(p.reason).toMatch(/no .*income/i);
  });

  it('WITHHOLDS when detection confidence is too low and unconfirmed', () => {
    const shaky: IncomeSource = { ...confident, detectionConfidence: 0.3, isUserConfirmed: false };
    const p = projectBalance({
      currentBalanceMinor: 84700,
      dailyBurnMinor: 8700,
      asOf: new Date('2026-08-29'),
      incomeSources: [shaky],
      floorMinor: 100000,
    });
    expect(p.available).toBe(false);
    expect(p.reason).toMatch(/confidence/i);
  });

  it('a user confirmation makes a low-confidence source usable (FR-071)', () => {
    const confirmed: IncomeSource = { ...confident, detectionConfidence: 0.3, isUserConfirmed: true };
    const p = projectBalance({
      currentBalanceMinor: 84700,
      dailyBurnMinor: 8700,
      asOf: new Date('2026-08-29'),
      incomeSources: [confirmed],
      floorMinor: 100000,
    });
    expect(p.available).toBe(true);
  });

  it('does not report a breach when the balance holds', () => {
    const p = projectBalance({
      currentBalanceMinor: 500000,
      dailyBurnMinor: 1000,
      asOf: new Date('2026-08-29'),
      incomeSources: [confident],
      floorMinor: 100000,
    });
    expect(p.breachesFloor).toBe(false);
  });
});
