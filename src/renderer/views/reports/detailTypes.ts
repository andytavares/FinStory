export interface CategoryComparison {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly parentId: string | null;
  readonly parentName: string | null;
  readonly currentMinor: number;
  readonly priorMinor: number;
  readonly changeMinor: number;
  readonly direction: 'up' | 'down' | 'flat';
}

export interface MonthlyContent {
  readonly totalIncomeMinor: number;
  readonly totalSpendingMinor: number;
  readonly savingsMinor: number;
  readonly savingsRate: number;
  readonly categoryComparisons: CategoryComparison[];
  readonly largestPurchases: Array<{
    id: string;
    amountMinor: number;
    categoryId: string;
    categoryName: string;
    merchantName: string;
    postedDate: string | null;
  }>;
  readonly recurringAudit: Array<{
    merchantKey: string;
    merchantName: string;
    currentAmountMinor: number;
    cadence: string;
    cumulativePaidMinor: number;
  }>;
  readonly projectedAnnualSpendingMinor: number;
  readonly projectionAssumption: string;
  readonly qualification: string | null;
}

export interface DigestContent {
  readonly hadActivity: boolean;
  readonly categoryTotals: Array<{
    categoryId: string;
    categoryName: string;
    parentId: string | null;
    parentName: string | null;
    totalMinor: number;
  }>;
  readonly deviations: Array<{
    categoryId: string;
    categoryName: string;
    hasClaim: boolean;
    direction: 'above' | 'below' | null;
    multiple: number | null;
    actualMinor: number;
  }>;
  readonly qualification: string | null;
}

export interface KpiPoint {
  readonly periodStart: string;
  readonly totalIncomeMinor: number;
  readonly totalSpendingMinor: number;
  readonly savingsMinor: number;
  readonly savingsRate: number;
}

export interface ReportRecord {
  readonly id: string;
  readonly type: 'weekly_digest' | 'monthly_report';
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly dataComplete: boolean;
  readonly wasLate: boolean;
  readonly content: MonthlyContent | DigestContent;
  readonly kpiSeries: readonly KpiPoint[];
}
