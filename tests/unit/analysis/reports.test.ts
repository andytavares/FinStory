import { describe, it, expect } from 'vitest';
import { buildWeeklyDigest, buildMonthlyReport } from '@main/analysis/reports';
import type { ReportInput } from '@main/analysis/reports';
import type { SpendingTransaction } from '@main/analysis/spending';

function tx(id: string, amountMinor: number, categoryId: string): SpendingTransaction {
  return {
    id,
    amountMinor,
    categoryId,
    settlementState: 'posted',
    isInternalTransfer: false,
    reversesTransactionId: null,
  };
}

const input: ReportInput = {
  periodStart: new Date('2026-08-01T04:00:00Z'),
  periodEnd: new Date('2026-09-01T04:00:00Z'),
  transactions: [
    tx('a', -64000, 'dining'),
    tx('b', -38000, 'shopping'),
    tx('c', -120000, 'rent'),
    tx('d', -18700, 'subscriptions'),
    tx('e', 520000, 'income'),
  ],
  priorPeriodTotals: { dining: -50000, shopping: -30000, rent: -120000, subscriptions: -18700 },
  baselinesByCategory: {},
  recurringCharges: [
    { merchantKey: 'netflix', currentAmountMinor: -1599, cadence: 'monthly', cumulativePaidMinor: -12792 },
  ],
  dataComplete: true,
  staleInstitutions: [],
};

describe('monthly report figures (FR-038)', () => {
  const r = buildMonthlyReport(input);

  it('reports total income and total spending separately', () => {
    expect(r.totalIncomeMinor).toBe(520000);
    expect(r.totalSpendingMinor).toBe(-(64000 + 38000 + 120000 + 18700));
  });

  it('computes savings and savings rate', () => {
    expect(r.savingsMinor).toBe(520000 - (64000 + 38000 + 120000 + 18700));
    expect(r.savingsRate).toBeCloseTo(r.savingsMinor / 520000, 5);
  });

  it('reports month-over-month change per category with a direction', () => {
    const dining = r.categoryComparisons.find((c) => c.categoryId === 'dining');
    expect(dining?.changeMinor).toBe(-14000);
    expect(dining?.direction).toBe('up');
    const rent = r.categoryComparisons.find((c) => c.categoryId === 'rent');
    expect(rent?.direction).toBe('flat');
  });

  it('lists largest purchases', () => {
    expect(r.largestPurchases[0]?.id).toBe('c');
  });

  it('includes a full recurring-charge audit', () => {
    expect(r.recurringAudit).toHaveLength(1);
  });

  it('states the assumption behind every projection (FR-041)', () => {
    expect(r.projectedAnnualSpendingMinor).toBeLessThan(0);
    expect(r.projectionAssumption).toMatch(/current|continue|assum/i);
  });

  it('reconciles: category totals equal the spending total (SC-004)', () => {
    const sum = r.categoryComparisons.reduce((a, c) => a + c.currentMinor, 0);
    expect(sum).toBe(r.totalSpendingMinor);
  });
});

describe('honest reporting under incomplete data (FR-009, SC-014)', () => {
  it('marks the report incomplete when an institution was stale', () => {
    const r = buildMonthlyReport({ ...input, dataComplete: false, staleInstitutions: ['Chase'] });
    expect(r.dataComplete).toBe(false);
    expect(r.qualification).toMatch(/incomplete|missing|stale/i);
  });

  it('carries no qualification when data is complete', () => {
    expect(buildMonthlyReport(input).qualification).toBeNull();
  });
});

describe('weekly digest suppresses claims without baselines (FR-040)', () => {
  it('reports plain totals and makes no deviation claim without baselines', () => {
    const d = buildWeeklyDigest(input);
    expect(d.deviations.every((x) => x.hasClaim === false)).toBe(true);
    expect(d.categoryTotals.length).toBeGreaterThan(0);
  });

  it('makes claims once baselines are sufficient', () => {
    const d = buildWeeklyDigest({
      ...input,
      baselinesByCategory: {
        dining: { meanMinor: -10000, stddevMinor: 2000, samplePeriods: 8, isSufficient: true },
      },
    });
    expect(d.deviations.some((x) => x.hasClaim)).toBe(true);
  });

  it('reports an empty period rather than failing or skipping (US4 AS4)', () => {
    const d = buildWeeklyDigest({ ...input, transactions: [] });
    expect(d.hadActivity).toBe(false);
    expect(d.categoryTotals).toHaveLength(0);
  });
});

describe('reports are reproducible (SC-010, SC-013)', () => {
  it('produces identical output from identical input', () => {
    expect(JSON.stringify(buildMonthlyReport(input))).toBe(JSON.stringify(buildMonthlyReport(input)));
  });
});
