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
/** Amounts may vary this much relative to the median and still count as "the same charge". */
const MAX_AMOUNT_VARIATION = 0.15;

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
  // subscription, however regular its timing.
  const amounts = sorted.map((o) => o.amountMinor);
  const medianAmount = median(amounts);
  if (medianAmount === 0) return null;
  const worstAmountDeviation = Math.max(
    ...amounts.map((a) => Math.abs(a - medianAmount) / Math.abs(medianAmount)),
  );
  if (worstAmountDeviation > MAX_AMOUNT_VARIATION) return null;

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

  // Every gap must sit within tolerance, not just the median — otherwise a
  // cluster of irregular purchases with a coincidental median would qualify.
  const allWithinTolerance = gaps.every((g) => Math.abs(g - match.days) <= match.tolerance);
  if (!allWithinTolerance) return null;

  const worstGapDeviation = Math.max(...gaps.map((g) => Math.abs(g - match.days) / match.days));
  const timingScore = 1 - Math.min(worstGapDeviation, 1);
  const amountScore = 1 - Math.min(worstAmountDeviation / MAX_AMOUNT_VARIATION, 1);
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
