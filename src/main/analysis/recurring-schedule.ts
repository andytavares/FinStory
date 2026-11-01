/** When a recurring charge is due next, and what it costs per month and per year. */

type RecurringCadence = 'weekly' | 'monthly' | 'quarterly' | 'annual';

const CHARGES_PER_YEAR: Record<RecurringCadence, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  annual: 1,
};

/** `lastSeenDate` is a `YYYY-MM-DD` day; the result is too. */
export function nextExpectedDate(lastSeenDate: string, cadence: RecurringCadence): string {
  const next = new Date(`${lastSeenDate}T00:00:00Z`);
  if (cadence === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  if (cadence === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
  if (cadence === 'quarterly') next.setUTCMonth(next.getUTCMonth() + 3);
  if (cadence === 'annual') next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next.toISOString().slice(0, 10);
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
