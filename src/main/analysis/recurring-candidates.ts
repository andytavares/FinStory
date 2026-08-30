import type { Cadence } from './cadence';

/**
 * Finding charges that look recurring, for the user to confirm.
 *
 * Deliberately more permissive than `detectRecurringCharges`, which writes to
 * the ledger and so must be sure. This produces *suggestions*: the user is the
 * one deciding, so two occurrences at a plausible interval is worth showing —
 * an annual subscription would otherwise need three years of history before
 * anyone heard about it.
 *
 * The grouping is exact: same payee, same amount. A price change starts a new
 * candidate rather than being absorbed, because "is this the same charge?" is
 * the question being put to the user.
 *
 * Pure over passed-in data (Constitution XIII).
 */

export interface CandidateObservation {
  readonly transactionId: string;
  readonly merchantKey: string;
  readonly merchantName: string;
  /** Negative = money out. Credits are income and are detected separately. */
  readonly amountMinor: number;
  readonly occurredAt: Date;
}

export interface RecurringCandidate {
  /** Stable identity of the group: this payee at this amount. */
  readonly key: string;
  readonly merchantKey: string;
  readonly merchantName: string;
  readonly amountMinor: number;
  readonly cadence: Cadence;
  readonly occurrences: number;
  readonly firstSeen: Date;
  readonly lastSeen: Date;
  readonly nextExpected: Date;
  /** 0–1. Rises with agreement between intervals and with how many were seen. */
  readonly confidence: number;
  readonly totalPaidMinor: number;
  readonly transactionIds: string[];
}

const DAY_MS = 86_400_000;

/** Two is enough to suggest. The user confirms; the detector does not decide. */
const MIN_OCCURRENCES = 2;

/** Only cadences a person would recognize as a subscription or a bill. */
const CADENCES: ReadonlyArray<{ cadence: Cadence; days: number; tolerance: number }> = [
  { cadence: 'weekly', days: 7, tolerance: 2 },
  { cadence: 'biweekly', days: 14, tolerance: 3 },
  { cadence: 'monthly', days: 30.4, tolerance: 5 },
  { cadence: 'quarterly', days: 91.3, tolerance: 12 },
  { cadence: 'annual', days: 365, tolerance: 30 },
];

export function findRecurringCandidates(
  observations: readonly CandidateObservation[],
): RecurringCandidate[] {
  const groups = new Map<string, CandidateObservation[]>();
  for (const o of observations) {
    if (o.amountMinor >= 0) continue;
    if (!o.merchantKey) continue;
    const key = `${o.merchantKey}:${o.amountMinor}`;
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }

  const candidates: RecurringCandidate[] = [];
  for (const [key, group] of groups) {
    if (group.length < MIN_OCCURRENCES) continue;

    const sorted = [...group].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      gaps.push((sorted[i]!.occurredAt.getTime() - sorted[i - 1]!.occurredAt.getTime()) / DAY_MS);
    }
    // Two charges on the same day are a duplicate, not a cadence.
    if (gaps.every((g) => g < 1)) continue;

    const match = bestCadence(gaps);
    if (!match) continue;

    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    candidates.push({
      key,
      merchantKey: first.merchantKey,
      merchantName: first.merchantName,
      amountMinor: first.amountMinor,
      cadence: match.cadence,
      occurrences: sorted.length,
      firstSeen: first.occurredAt,
      lastSeen: last.occurredAt,
      nextExpected: new Date(last.occurredAt.getTime() + match.days * DAY_MS),
      confidence: match.confidence,
      totalPaidMinor: sorted.reduce((sum, o) => sum + o.amountMinor, 0),
      transactionIds: sorted.map((o) => o.transactionId),
    });
  }

  // Most convincing first, then by how much money it is: a confident $200/month
  // charge deserves attention before a confident $2 one.
  return candidates.sort(
    (a, b) => b.confidence - a.confidence || a.totalPaidMinor - b.totalPaidMinor,
  );
}

/** Share of gaps that must fit before a cadence is worth suggesting. */
const MIN_AGREEMENT = 0.75;
/** A gap may span this many missed periods and still be the same cadence. */
const MAX_SKIPPED_PERIODS = 3;

function bestCadence(
  gaps: readonly number[],
): { cadence: Cadence; days: number; confidence: number } | null {
  let best: { cadence: Cadence; days: number; confidence: number } | null = null;

  for (const option of CADENCES) {
    // A gap may span missed periods and still be the same cadence — a paused
    // month, or a charge that failed and retried.
    const fits = gaps.map((gap) => {
      const periods = Math.round(gap / option.days);
      if (periods < 1 || periods > MAX_SKIPPED_PERIODS) return null;
      const expected = option.days * periods;
      if (Math.abs(gap - expected) > option.tolerance * periods) return null;
      return { periods, error: Math.abs(gap - expected) / expected };
    });

    const agreeing = fits.filter((f): f is { periods: number; error: number } => f !== null);
    const agreement = agreeing.length / gaps.length;
    if (agreement < MIN_AGREEMENT) continue;

    const meanError = agreeing.reduce((a, f) => a + f.error, 0) / agreeing.length;
    const meanPeriods = agreeing.reduce((a, f) => a + f.periods, 0) / agreeing.length;
    // Dividing by the periods assumed is what stops a monthly gap being read as
    // two skipped fortnights: an explanation that needs missed charges to work
    // is a weaker explanation than one that does not.
    const fit = (1 - meanError) / meanPeriods;

    // More observations is more convincing, but never certainty: this is a
    // suggestion, and claiming 100% would be dishonest (Constitution IX).
    const evidence = Math.min(1, (gaps.length + 1) / 4);
    const confidence = Number(Math.min(0.95, fit * agreement * 0.6 + evidence * 0.35).toFixed(4));

    if (!best || confidence > best.confidence) {
      best = { cadence: option.cadence, days: option.days, confidence };
    }
  }
  return best;
}
