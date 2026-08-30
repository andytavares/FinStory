import { breakdownByCategory, spendingTotalMinor, isSpending } from './spending';
import type { SpendingTransaction } from './spending';
import { describeDeviation, type Baseline, type Deviation } from './baselines';
import { sumMinor } from '@shared/money';

/**
 * Weekly digest and monthly report.
 *
 * Pure over passed-in data (Constitution XIII), which is what makes SC-010
 * ("every figure independently reproducible") a property the tests can assert
 * rather than a claim.
 */

export interface RecurringSummary {
  readonly merchantKey: string;
  readonly currentAmountMinor: number;
  readonly cadence: string;
  readonly cumulativePaidMinor: number;
}

export interface ReportInput {
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly transactions: readonly SpendingTransaction[];
  readonly priorPeriodTotals: Readonly<Record<string, number>>;
  readonly baselinesByCategory: Readonly<Record<string, Baseline>>;
  readonly recurringCharges: readonly RecurringSummary[];
  readonly dataComplete: boolean;
  readonly staleInstitutions: readonly string[];
}

const PROJECTION_ASSUMPTION =
  'Assumes current spending patterns continue unchanged. This is a projection, not a forecast.';

function qualificationFor(input: ReportInput): string | null {
  if (input.dataComplete) return null;
  const names = input.staleInstitutions.join(', ');
  return `Figures are incomplete: data from ${names || 'one or more accounts'} was stale or ` +
    'unavailable during this period. Totals shown are lower bounds.';
}

export interface CategoryComparison {
  readonly categoryId: string;
  readonly currentMinor: number;
  readonly priorMinor: number;
  readonly changeMinor: number;
  readonly direction: 'up' | 'down' | 'flat';
}

export interface MonthlyReport {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly totalIncomeMinor: number;
  readonly totalSpendingMinor: number;
  readonly savingsMinor: number;
  readonly savingsRate: number;
  readonly categoryComparisons: CategoryComparison[];
  readonly largestPurchases: SpendingTransaction[];
  readonly recurringAudit: RecurringSummary[];
  readonly projectedAnnualSpendingMinor: number;
  readonly projectionAssumption: string;
  readonly dataComplete: boolean;
  readonly qualification: string | null;
}

export function buildMonthlyReport(input: ReportInput): MonthlyReport {
  const spending = input.transactions.filter(isSpending);
  const income = input.transactions.filter((t) => t.amountMinor > 0 && !t.isInternalTransfer);

  const totalIncomeMinor = sumMinor(income.map((t) => t.amountMinor));
  const totalSpendingMinor = spendingTotalMinor(input.transactions);
  const savingsMinor = totalIncomeMinor + totalSpendingMinor;

  const breakdown = breakdownByCategory(input.transactions);
  const categoryComparisons = breakdown.rows.map((row) => {
    const priorMinor = input.priorPeriodTotals[row.categoryId] ?? 0;
    const changeMinor = row.totalMinor - priorMinor;
    return {
      categoryId: row.categoryId,
      currentMinor: row.totalMinor,
      priorMinor,
      // Spending is negative, so a more-negative change means spending went up.
      direction: changeMinor === 0 ? ('flat' as const) : changeMinor < 0 ? ('up' as const) : ('down' as const),
      changeMinor,
    };
  });

  const largestPurchases = [...spending].sort((a, b) => a.amountMinor - b.amountMinor).slice(0, 10);

  return {
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    totalIncomeMinor,
    totalSpendingMinor,
    savingsMinor,
    savingsRate: totalIncomeMinor === 0 ? 0 : savingsMinor / totalIncomeMinor,
    categoryComparisons,
    largestPurchases,
    recurringAudit: [...input.recurringCharges],
    projectedAnnualSpendingMinor: totalSpendingMinor * 12,
    projectionAssumption: PROJECTION_ASSUMPTION,
    dataComplete: input.dataComplete,
    qualification: qualificationFor(input),
  };
}

export interface DigestDeviation extends Deviation {
  readonly categoryId: string;
}

export interface WeeklyDigest {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly hadActivity: boolean;
  readonly categoryTotals: Array<{ categoryId: string; totalMinor: number }>;
  readonly deviations: DigestDeviation[];
  readonly dataComplete: boolean;
  readonly qualification: string | null;
}

export function buildWeeklyDigest(input: ReportInput): WeeklyDigest {
  const breakdown = breakdownByCategory(input.transactions);

  const deviations = breakdown.rows.map((row) => {
    const baseline = input.baselinesByCategory[row.categoryId];
    // No baseline at all is the same situation as an insufficient one: state the
    // total, claim nothing (FR-040).
    const effective: Baseline = baseline ?? {
      meanMinor: 0,
      stddevMinor: 0,
      samplePeriods: 0,
      isSufficient: false,
    };
    return { categoryId: row.categoryId, ...describeDeviation(row.totalMinor, effective) };
  });

  return {
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    hadActivity: breakdown.rows.length > 0,
    categoryTotals: breakdown.rows.map((r) => ({ categoryId: r.categoryId, totalMinor: r.totalMinor })),
    deviations,
    dataComplete: input.dataComplete,
    qualification: qualificationFor(input),
  };
}
