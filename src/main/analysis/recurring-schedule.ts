/** When a recurring charge is due next, and what it costs per month and per year. */

import type { Cadence as RecurringCadence } from './cadence';

const CHARGES_PER_YEAR: Record<RecurringCadence, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  quarterly: 4,
  annual: 1,
};

const DAYS_AHEAD: Partial<Record<RecurringCadence, number>> = { weekly: 7, biweekly: 14 };
const MONTHS_AHEAD: Partial<Record<RecurringCadence, number>> = { monthly: 1, quarterly: 3, annual: 12 };

/** `lastSeenDate` is a `YYYY-MM-DD` day; the result is too. A month-end day stays at the end of a shorter month. */
export function nextExpectedDate(lastSeenDate: string, cadence: RecurringCadence): string {
  const last = new Date(`${lastSeenDate}T00:00:00Z`);
  const days = DAYS_AHEAD[cadence];
  if (days !== undefined) return new Date(last.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  if (cadence === 'semimonthly') return nextHalfMonth(last);
  return addMonths(last, MONTHS_AHEAD[cadence] ?? 1, last.getUTCDate());
}

/** Twice a month: a first-half day moves 15 days on, a second-half day to the same point next month. */
function nextHalfMonth(last: Date): string {
  const day = last.getUTCDate();
  return day <= 15 ? addMonths(last, 0, day + 15) : addMonths(last, 1, day - 15);
}

function addMonths(from: Date, months: number, day: number): string {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDayOfMonth))).toISOString().slice(0, 10);
}

/** Positive amounts, whatever the sign of the stored charge. */
export function yearlyCostMinor(amountMinor: number, cadence: RecurringCadence): number {
  return Math.abs(amountMinor) * CHARGES_PER_YEAR[cadence];
}

export function monthlyCostMinor(amountMinor: number, cadence: RecurringCadence): number {
  return Math.round(yearlyCostMinor(amountMinor, cadence) / 12);
}

export interface UpcomingCharge {
  readonly merchantName: string;
  readonly date: string;
  readonly amountMinor: number;
}

export function upcomingCharges(
  charges: ReadonlyArray<UpcomingCharge>,
  today: string,
  count = 3,
): UpcomingCharge[] {
  return charges
    .filter((charge) => charge.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, count);
}
