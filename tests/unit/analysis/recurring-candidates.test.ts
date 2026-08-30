import { describe, it, expect } from 'vitest';
import { findRecurringCandidates } from '@main/analysis/recurring-candidates';
import type { CandidateObservation } from '@main/analysis/recurring-candidates';

function charge(
  day: string,
  amountMinor: number,
  merchantKey = 'netflix',
  merchantName = 'Netflix',
): CandidateObservation {
  return {
    transactionId: `t_${merchantKey}_${day}_${amountMinor}`,
    merchantKey,
    merchantName,
    amountMinor,
    occurredAt: new Date(`${day}T12:00:00Z`),
  };
}

describe('findRecurringCandidates', () => {
  it('finds a monthly charge at the same amount', () => {
    const found = findRecurringCandidates([
      charge('2026-06-01', -1599),
      charge('2026-07-01', -1599),
      charge('2026-08-01', -1599),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      merchantKey: 'netflix',
      merchantName: 'Netflix',
      amountMinor: -1599,
      cadence: 'monthly',
      occurrences: 3,
    });
  });

  it('finds a weekly charge', () => {
    const found = findRecurringCandidates([
      charge('2026-08-01', -1200, 'gym', 'Gym'),
      charge('2026-08-08', -1200, 'gym', 'Gym'),
      charge('2026-08-15', -1200, 'gym', 'Gym'),
    ]);
    expect(found[0]?.cadence).toBe('weekly');
  });

  it('finds an annual charge from only two occurrences', () => {
    // Three years of history before mentioning a yearly renewal is useless.
    const found = findRecurringCandidates([
      charge('2025-03-14', -9900, 'domain', 'Domain Registrar'),
      charge('2026-03-15', -9900, 'domain', 'Domain Registrar'),
    ]);
    expect(found[0]?.cadence).toBe('annual');
    expect(found[0]?.occurrences).toBe(2);
  });

  it('separates the same payee at different amounts', () => {
    const found = findRecurringCandidates([
      charge('2026-06-01', -1599),
      charge('2026-07-01', -1599),
      charge('2026-06-15', -999),
      charge('2026-07-15', -999),
    ]);
    expect(found).toHaveLength(2);
    expect(new Set(found.map((c) => c.amountMinor))).toEqual(new Set([-1599, -999]));
  });

  it('ignores a single charge', () => {
    expect(findRecurringCandidates([charge('2026-08-01', -1599)])).toEqual([]);
  });

  it('ignores income', () => {
    expect(
      findRecurringCandidates([
        charge('2026-06-01', 250000, 'payroll', 'Payroll'),
        charge('2026-06-15', 250000, 'payroll', 'Payroll'),
      ]),
    ).toEqual([]);
  });

  it('ignores irregular one-offs that happen to share an amount', () => {
    const found = findRecurringCandidates([
      charge('2026-01-03', -2000, 'shop', 'Shop'),
      charge('2026-01-09', -2000, 'shop', 'Shop'),
      charge('2026-04-27', -2000, 'shop', 'Shop'),
      charge('2026-05-02', -2000, 'shop', 'Shop'),
    ]);
    expect(found).toEqual([]);
  });

  it('treats two charges on the same day as a duplicate, not a cadence', () => {
    expect(
      findRecurringCandidates([
        charge('2026-08-01', -2000, 'shop', 'Shop'),
        { ...charge('2026-08-01', -2000, 'shop', 'Shop'), transactionId: 'second' },
      ]),
    ).toEqual([]);
  });

  it('tolerates a skipped period', () => {
    const found = findRecurringCandidates([
      charge('2026-04-01', -1599),
      charge('2026-05-01', -1599),
      // June missed — a failed payment that retried in July.
      charge('2026-07-01', -1599),
      charge('2026-08-01', -1599),
    ]);
    expect(found[0]?.cadence).toBe('monthly');
  });

  it('projects when the next one is due', () => {
    const found = findRecurringCandidates([
      charge('2026-06-01', -1599),
      charge('2026-07-01', -1599),
      charge('2026-08-01', -1599),
    ]);
    const next = found[0]!.nextExpected;
    expect(next.getTime()).toBeGreaterThan(new Date('2026-08-25T00:00:00Z').getTime());
    expect(next.getTime()).toBeLessThan(new Date('2026-09-05T00:00:00Z').getTime());
  });

  it('is more confident about more occurrences', () => {
    const two = findRecurringCandidates([charge('2026-07-01', -1599), charge('2026-08-01', -1599)]);
    const four = findRecurringCandidates([
      charge('2026-05-01', -1599),
      charge('2026-06-01', -1599),
      charge('2026-07-01', -1599),
      charge('2026-08-01', -1599),
    ]);
    expect(four[0]!.confidence).toBeGreaterThan(two[0]!.confidence);
  });

  it('never claims certainty, because this is a suggestion', () => {
    const found = findRecurringCandidates(
      Array.from({ length: 12 }, (_, i) =>
        charge(`2026-0${((i % 9) + 1).toString()}-01`, -1599),
      ),
    );
    for (const c of found) expect(c.confidence).toBeLessThan(1);
  });

  it('totals what has been paid and lists every instance', () => {
    const found = findRecurringCandidates([
      charge('2026-06-01', -1599),
      charge('2026-07-01', -1599),
      charge('2026-08-01', -1599),
    ]);
    expect(found[0]?.totalPaidMinor).toBe(-4797);
    expect(found[0]?.transactionIds).toHaveLength(3);
  });

  it('skips transactions with no merchant key, which cannot be grouped', () => {
    expect(
      findRecurringCandidates([
        charge('2026-07-01', -1599, ''),
        charge('2026-08-01', -1599, ''),
      ]),
    ).toEqual([]);
  });

  it('ranks the most convincing first', () => {
    const found = findRecurringCandidates([
      charge('2026-07-01', -500, 'weak', 'Weak'),
      charge('2026-08-01', -500, 'weak', 'Weak'),
      charge('2026-05-01', -1599, 'strong', 'Strong'),
      charge('2026-06-01', -1599, 'strong', 'Strong'),
      charge('2026-07-01', -1599, 'strong', 'Strong'),
      charge('2026-08-01', -1599, 'strong', 'Strong'),
    ]);
    expect(found[0]?.merchantKey).toBe('strong');
  });
});
