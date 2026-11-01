import type { IncomeSourceView } from '@shared/types';

const DEPOSITS_PER_YEAR: Record<string, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

/** Expected income per month across all sources, in minor units. */
export function monthlyIncomeMinor(sources: readonly IncomeSourceView[]): number {
  const yearly = sources.reduce(
    (sum, s) => sum + s.expectedAmountMinor * (DEPOSITS_PER_YEAR[s.cadence] ?? 12),
    0,
  );
  return Math.round(yearly / 12);
}
