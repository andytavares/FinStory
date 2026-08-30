/**
 * Money is represented exclusively as integer minor units (cents).
 *
 * Constitution Principle II: floating-point arithmetic on money is forbidden.
 * Every amount that crosses a boundary — database, IPC, external API — is an
 * integer. Doubles appear only at the edges, when parsing an external decimal
 * or rendering for display.
 */

const MINOR_UNITS_PER_MAJOR = 100;

/** True when `value` is a valid minor-unit amount. */
export function isMoneyAmount(value: number): boolean {
  return Number.isSafeInteger(value);
}

function assertMinor(value: number): void {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Expected integer minor units, received ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Amount ${value} is outside the safe integer range`);
  }
}

/**
 * Convert a major-unit number (dollars) to minor units.
 *
 * Rounds half away from zero. Half-to-even would under-report on exact halves,
 * and truncation would silently lose a cent on every conversion.
 */
export function toMinor(major: number): number {
  if (!Number.isFinite(major)) {
    throw new TypeError(`Cannot convert non-finite value ${major} to minor units`);
  }
  // Scale before rounding, and nudge by epsilon-relative correction so that
  // values like 1.005 — stored as 1.00499999... — round the way a person expects.
  const scaled = major * MINOR_UNITS_PER_MAJOR;
  const corrected = scaled + Math.sign(scaled) * Number.EPSILON * Math.abs(scaled);
  const result = Math.sign(corrected) * Math.round(Math.abs(corrected));
  assertMinor(result);
  return result === 0 ? 0 : result;
}

/** Convert minor units back to a major-unit number. For display and export only. */
export function fromMinor(minor: number): number {
  assertMinor(minor);
  return minor / MINOR_UNITS_PER_MAJOR;
}

/** Add two minor-unit amounts. */
export function addMinor(a: number, b: number): number {
  assertMinor(a);
  assertMinor(b);
  const sum = a + b;
  assertMinor(sum);
  return sum;
}

/** Sum minor-unit amounts. Empty input sums to zero. */
export function sumMinor(amounts: readonly number[]): number {
  let total = 0;
  for (const amount of amounts) {
    total = addMinor(total, amount);
  }
  return total;
}

/** Negate a minor-unit amount. */
export function negateMinor(minor: number): number {
  assertMinor(minor);
  return minor === 0 ? 0 : -minor;
}

const DECIMAL_MONEY = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parse a decimal money string directly to minor units without a float round-trip.
 *
 * Used for external data (API payloads, imports) where the source is a string.
 * Rejects anything ambiguous rather than guessing — a misparsed amount is a
 * silent financial error.
 */
export function parseMinorFromDecimalString(input: string): number {
  const match = DECIMAL_MONEY.exec(input.trim());
  if (!match) {
    throw new TypeError(`Malformed money string: ${JSON.stringify(input)}`);
  }
  const [, sign, whole, fraction = ''] = match;
  const cents = (fraction ?? '').padEnd(2, '0');
  const magnitude = Number(whole) * MINOR_UNITS_PER_MAJOR + Number(cents);
  assertMinor(magnitude);
  return sign === '-' ? negateMinor(magnitude) : magnitude;
}

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/** Format minor units for display. Presentation only — never parsed back. */
export function formatMinor(minor: number): string {
  assertMinor(minor);
  return USD_FORMATTER.format(fromMinor(minor));
}
