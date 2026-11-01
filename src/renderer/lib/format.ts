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

/** "Gold Card ••1005", or just the name when the bank gave no last digits. */
export function accountLabel(name: string, mask: string | null): string {
  return mask ? `${name} ••${mask}` : name;
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
/**
 * A percentage, always with its unit and two decimals.
 *
 * Numbers in this app are money or percentages; a bare figure leaves the reader
 * guessing which — and "up 5259" for a $5,258.67 change is simply wrong.
 */
export function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(2)}%`;
}

/** Signed money for a change, e.g. "+$412.00" / "−$88.10". */
export function signedMoney(minor: number): string {
  const sign = minor > 0 ? '+' : minor < 0 ? '−' : '';
  return `${sign}${USD.format(Math.abs(minor) / 100)}`;
}

export function periodLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const midpoint = new Date(start + (end - start) / 2);
  return midpoint.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Chart axis money: "$450", "$1.5k", "$2k". */
export function axisMoney(minor: number): string {
  const dollars = Math.round(minor / 100);
  if (Math.abs(dollars) < 1000) return `$${dollars}`;
  return `$${Number((dollars / 1000).toFixed(1))}k`;
}

const SHORT_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const SHORT_MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

/** A YYYY-MM-DD calendar day as "Nov 5"; read as UTC so no time zone shifts it. */
export function axisDay(isoDate: string): string {
  return SHORT_DAY.format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));
}

/** A YYYY-MM period as "Jun"; any other period label is already readable. */
export function axisPeriod(label: string): string {
  return /^\d{4}-\d{2}$/.test(label) ? SHORT_MONTH.format(new Date(`${label}-01T00:00:00Z`)) : label;
}
