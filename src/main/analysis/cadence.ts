/**
 * Shared cadence detection.
 *
 * Income and recurring charges are structurally the same problem — a repeating
 * amount at a repeating interval from a repeating counterparty, differing only
 * in sign. One detector serves both (research.md R11), so there is one
 * algorithm to test and trust rather than two that drift apart.
 *
 * Pure function over passed-in data: no database, network, or clock access
 * (Constitution XIII).
 */

export interface CadenceInput {
  readonly occurredAt: Date;
  readonly amountMinor: number;
}

export type Cadence = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'annual';

export interface CadenceResult {
  readonly cadence: Cadence;
  readonly amountMinor: number;
  readonly intervalDays: number;
  readonly confidence: number;
  readonly firstSeen: Date;
  readonly lastSeen: Date;
  readonly occurrences: number;
}

const DAY_MS = 86_400_000;

/** Expected spacing per cadence, with the tolerance a real biller drifts within. */
const CADENCES: ReadonlyArray<{ cadence: Cadence; days: number; tolerance: number }> = [
  { cadence: 'weekly', days: 7, tolerance: 2 },
  { cadence: 'biweekly', days: 14, tolerance: 3 },
  { cadence: 'semimonthly', days: 15.2, tolerance: 3 },
  { cadence: 'monthly', days: 30.4, tolerance: 5 },
  { cadence: 'quarterly', days: 91.3, tolerance: 12 },
  { cadence: 'annual', days: 365, tolerance: 30 },
];

const MIN_OCCURRENCES = 3;
/**
 * Amounts may vary this much from the median and still be "the same charge".
 *
 * Real subscriptions move: tax changes, proration, plan tweaks, usage-based
 * lines. Measured against the median so one outlier does not drag the centre.
 */
const MAX_AMOUNT_VARIATION = 0.25;
/** Share of intervals that must match the cadence. */
const MIN_INTERVAL_AGREEMENT = 0.6;
/** A gap may span this many missed periods and still count as the same cadence. */
const MAX_SKIPPED_PERIODS = 3;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Detect a recurring cadence, or null when the series is not recurring.
 *
 * Returning null is as important as detecting: FR-025 requires that irregular
 * repeat purchases at one merchant are never listed as a subscription.
 */
export function detectCadence(inputs: readonly CadenceInput[]): CadenceResult | null {
  if (inputs.length < MIN_OCCURRENCES) return null;

  const sorted = [...inputs].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  // Amount consistency. A charge whose amount swings wildly is not one
  // subscription, however regular its timing. Judged on the typical deviation
  // rather than the worst one, so a single odd month does not disqualify a
  // genuine subscription.
  const amounts = sorted.map((o) => o.amountMinor);
  const medianAmount = median(amounts);
  if (medianAmount === 0) return null;
  const deviations = amounts.map((a) => Math.abs(a - medianAmount) / Math.abs(medianAmount));
  const typicalAmountDeviation = median(deviations);
  if (typicalAmountDeviation > MAX_AMOUNT_VARIATION) return null;

  // Interval consistency.
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (!prev || !curr) continue;
    gaps.push((curr.occurredAt.getTime() - prev.occurredAt.getTime()) / DAY_MS);
  }
  if (gaps.length === 0) return null;
  const medianGap = median(gaps);

  const match = CADENCES.find((c) => Math.abs(medianGap - c.days) <= c.tolerance);
  if (!match) return null;

  /**
   * A gap counts if it matches the cadence, or a small whole multiple of it —
   * a skipped month is still a monthly subscription. Requiring every gap to be
   * exact meant one missed or duplicated charge hid the subscription entirely.
   */
  const agreeing = gaps.filter((g) => {
    for (let periods = 1; periods <= MAX_SKIPPED_PERIODS; periods += 1) {
      if (Math.abs(g - match.days * periods) <= match.tolerance * periods) return true;
    }
    return false;
  });
  const agreement = agreeing.length / gaps.length;
  if (agreement < MIN_INTERVAL_AGREEMENT) return null;

  // Deviation from the NEAREST whole multiple, not from one period — a 60-day
  // gap on a monthly charge is exact, not 100% off.
  const worstGapDeviation = Math.max(
    ...agreeing.map((g) => {
      const periods = Math.max(1, Math.round(g / match.days));
      return Math.abs(g - match.days * periods) / (match.days * periods);
    }),
    0,
  );
  const timingScore = (1 - Math.min(worstGapDeviation, 1)) * agreement;
  const amountScore = 1 - Math.min(typicalAmountDeviation / MAX_AMOUNT_VARIATION, 1);
  // More observations mean more confidence, saturating at six.
  const sampleScore = Math.min(sorted.length / 6, 1);
  const confidence = Number((timingScore * 0.5 + amountScore * 0.3 + sampleScore * 0.2).toFixed(4));

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;

  return {
    cadence: match.cadence,
    amountMinor: Math.round(medianAmount),
    intervalDays: Number(medianGap.toFixed(2)),
    confidence,
    firstSeen: first.occurredAt,
    lastSeen: last.occurredAt,
    occurrences: sorted.length,
  };
}
