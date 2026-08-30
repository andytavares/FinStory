/** Renderer-side formatting. Amounts arrive as integer minor units. */

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const USD_COMPACT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function money(minor: number): string {
  return USD.format(minor / 100);
}

export function moneyCompact(minor: number): string {
  return USD_COMPACT.format(minor / 100);
}

/** Spending is stored negative; show magnitude and let context carry the sign. */
export function spend(minor: number): string {
  return USD.format(Math.abs(minor) / 100);
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function relativeAge(iso: string | null): string {
  if (!iso) return 'never';
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return 'just now';
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Name the month a period belongs to.
 *
 * Uses the midpoint, not the start: a period stored as midnight UTC renders as
 * the previous month for anyone behind UTC, which would label an August report
 * "July".
 */
export function periodLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const midpoint = new Date(start + (end - start) / 2);
  return midpoint.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
