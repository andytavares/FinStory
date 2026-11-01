import type { IncomeSourceView } from '@shared/types';

/** `income:list` rows carry the days to the next deposit. */
export interface DatedIncomeSource extends IncomeSourceView {
  readonly daysUntilNext: number;
}

/** One month from `income:history`. Spending is positive. */
export interface MonthTotal {
  readonly month: string;
  readonly incomeMinor: number;
  readonly spendingMinor: number;
}
