export type ReportType = 'weekly_digest' | 'monthly_report' | 'custom';

export interface ReportSummary {
  readonly id: string;
  readonly type: ReportType;
  readonly label: string | null;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly dataComplete: boolean;
  readonly wasLate: boolean;
  readonly totalSpendingMinor: number;
  readonly savingsRate: number;
  readonly headline: string;
  /** Spending per day across the period, positive minor units. */
  readonly series: readonly number[];
}
