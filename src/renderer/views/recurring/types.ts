import type { RecurringChargeView } from '@shared/types';

/** `recurring:list` rows carry schedule and cost fields beyond the shared view type. */
export interface ScheduledCharge extends RecurringChargeView {
  readonly nextExpectedDate: string;
  readonly monthlyCostMinor: number;
  readonly yearlyCostMinor: number;
}
