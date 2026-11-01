/** When a recurring charge is due next, and what it costs per month and per year. */

type RecurringCadence = 'weekly' | 'monthly' | 'quarterly' | 'annual';

const CHARGES_PER_YEAR: Record<RecurringCadence, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  annual: 1,
};

const MONTHS_AHEAD: Record<Exclude<RecurringCadence, 'weekly'>, number> = { monthly: 1, quarterly: 3, annual: 12 };

/** `lastSeenDate` is a `YYYY-MM-DD` day; the result is too. A month-end day stays at the end of a shorter month. */
export function nextExpectedDate(lastSeenDate: string, cadence: RecurringCadence): string {
  const last = new Date(`${lastSeenDate}T00:00:00Z`);
  if (cadence === 'weekly') return new Date(last.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const year = last.getUTCFullYear();
  const month = last.getUTCMonth() + MONTHS_AHEAD[cadence];
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(last.getUTCDate(), lastDayOfMonth))).toISOString().slice(0, 10);
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
