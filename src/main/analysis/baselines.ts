/**
 * Personal baselines and deviation reporting.
 *
 * Constitution IX (Honest Reporting): a claim must not be made without
 * sufficient data to support it. The `isSufficient` flag is the mechanism —
 * every consumer must report a plain total and suppress any deviation claim
 * when it is false (FR-040). This is what stops the system inventing anomalies
 * from a two-week sample.
 *
 * All comparisons are against the user's own history. No external benchmarks
 * or population averages (FR-039).
 */

/** Four periods is the minimum from which a "normal range" means anything. */
export const MIN_PERIODS_FOR_BASELINE = 4;

/** Deviation must exceed this many standard deviations to be worth reporting. */
const SIGNIFICANCE_SIGMA = 2;

export interface Baseline {
  readonly meanMinor: number;
  readonly stddevMinor: number;
  readonly samplePeriods: number;
  readonly isSufficient: boolean;
}

export interface Deviation {
  readonly actualMinor: number;
  /** False means: report the total, make no comparative claim. */
  readonly hasClaim: boolean;
  readonly direction: 'above' | 'below' | null;
  /** Null when no meaningful multiple exists (insufficient history, or zero baseline). */
  readonly multiple: number | null;
}

export function computeBaseline(periodTotalsMinor: readonly number[]): Baseline {
  const n = periodTotalsMinor.length;
  if (n === 0) {
    return { meanMinor: 0, stddevMinor: 0, samplePeriods: 0, isSufficient: false };
  }
  const mean = periodTotalsMinor.reduce((a, b) => a + b, 0) / n;
  const variance = periodTotalsMinor.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  return {
    meanMinor: Math.round(mean),
    stddevMinor: Math.round(Math.sqrt(variance)),
    samplePeriods: n,
    isSufficient: n >= MIN_PERIODS_FOR_BASELINE,
  };
}

export function describeDeviation(actualMinor: number, baseline: Baseline): Deviation {
  // Insufficient history: state the fact, claim nothing.
  if (!baseline.isSufficient) {
    return { actualMinor, hasClaim: false, direction: null, multiple: null };
  }

  const { meanMinor, stddevMinor } = baseline;
  const multiple = meanMinor === 0 ? null : Number((actualMinor / meanMinor).toFixed(4));

  // With no variance in the sample, any difference at all is "unusual" — but a
  // sample that never varies is more likely thin than genuinely rigid, so
  // require an absolute difference before claiming.
  const threshold = stddevMinor === 0 ? Math.abs(meanMinor) * 0.5 : stddevMinor * SIGNIFICANCE_SIGMA;
  const difference = actualMinor - meanMinor;

  if (Math.abs(difference) <= threshold) {
    return { actualMinor, hasClaim: false, direction: null, multiple };
  }

  return {
    actualMinor,
    hasClaim: true,
    direction: difference > 0 ? 'above' : 'below',
    multiple,
  };
}
