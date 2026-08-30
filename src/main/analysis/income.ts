import { detectCadence } from './cadence';

/**
 * Income detection and balance projection.
 *
 * Income is the same shape of problem as a subscription — a repeating amount at
 * a repeating interval — so it runs the same cadence detector against credits
 * instead of debits (research.md R11). One algorithm, one test surface.
 */

export type IncomeCadence = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

export interface IncomeObservation {
  readonly transactionId: string;
  readonly accountId: string;
  readonly merchantKey: string;
  /** Positive = money in. */
  readonly amountMinor: number;
  readonly occurredAt: Date;
}

export interface IncomeSource {
  readonly id: string;
  readonly accountId: string;
  readonly merchantKey: string;
  readonly expectedAmountMinor: number;
  readonly cadence: IncomeCadence;
  readonly nextExpectedDate: Date;
  readonly detectionConfidence: number;
  /** Pins the pattern; suppresses re-derivation until cleared (FR-071). */
  readonly isUserConfirmed: boolean;
  readonly isActive: boolean;
}

const INCOME_CADENCES = new Set<string>(['weekly', 'biweekly', 'semimonthly', 'monthly']);
const DAY_MS = 86_400_000;

/** Below this, a projection is withheld unless the user has confirmed the source. */
const MIN_PROJECTION_CONFIDENCE = 0.6;

export function detectIncomeSources(observations: readonly IncomeObservation[]): IncomeSource[] {
  const byKey = new Map<string, IncomeObservation[]>();
  for (const o of observations) {
    // Credits only.
    if (o.amountMinor <= 0) continue;
    byKey.set(o.merchantKey, [...(byKey.get(o.merchantKey) ?? []), o]);
  }

  const sources: IncomeSource[] = [];
  for (const [merchantKey, group] of byKey) {
    const cadence = detectCadence(
      group.map((o) => ({ occurredAt: o.occurredAt, amountMinor: o.amountMinor })),
    );
    if (!cadence) continue;
    // Quarterly and annual credits are not a paycheck.
    if (!INCOME_CADENCES.has(cadence.cadence)) continue;

    const first = group[0];
    if (!first) continue;

    sources.push({
      id: `inc_${merchantKey}`,
      accountId: first.accountId,
      merchantKey,
      expectedAmountMinor: cadence.amountMinor,
      cadence: cadence.cadence as IncomeCadence,
      nextExpectedDate: new Date(cadence.lastSeen.getTime() + cadence.intervalDays * DAY_MS),
      detectionConfidence: cadence.confidence,
      isUserConfirmed: false,
      isActive: true,
    });
  }
  return sources;
}

export interface ProjectionInput {
  readonly currentBalanceMinor: number;
  readonly dailyBurnMinor: number;
  readonly asOf: Date;
  readonly incomeSources: readonly IncomeSource[];
  readonly floorMinor: number;
}

export interface Projection {
  /** False means: make no claim. The caller must not render a number. */
  readonly available: boolean;
  readonly projectedMinor: number | null;
  readonly nextIncomeDate: Date | null;
  readonly breachesFloor: boolean;
  readonly reason: string;
}

/**
 * Project the balance forward to the next expected income.
 *
 * Constitution IX: when income is unknown or the pattern is not trustworthy,
 * this WITHHOLDS rather than projecting against an assumed date. A confidently
 * wrong "you will run out on the 3rd" is worse than saying nothing.
 */
export function projectBalance(input: ProjectionInput): Projection {
  const usable = input.incomeSources
    .filter((s) => s.isActive)
    .filter((s) => s.isUserConfirmed || s.detectionConfidence >= MIN_PROJECTION_CONFIDENCE)
    .filter((s) => s.nextExpectedDate.getTime() > input.asOf.getTime())
    .sort((a, b) => a.nextExpectedDate.getTime() - b.nextExpectedDate.getTime());

  const next = usable[0];
  if (!next) {
    const hasAny = input.incomeSources.some((s) => s.isActive);
    return {
      available: false,
      projectedMinor: null,
      nextIncomeDate: null,
      breachesFloor: false,
      reason: hasAny
        ? 'Income pattern confidence is too low to project; confirm it in settings'
        : 'No recurring income detected yet, so no payday to project toward',
    };
  }

  const days = Math.max(
    0,
    Math.ceil((next.nextExpectedDate.getTime() - input.asOf.getTime()) / DAY_MS),
  );
  const projected = input.currentBalanceMinor - input.dailyBurnMinor * days;

  return {
    available: true,
    projectedMinor: projected,
    nextIncomeDate: next.nextExpectedDate,
    breachesFloor: projected < input.floorMinor,
    reason: `Assumes spending continues at the current daily rate through ${days} day(s)`,
  };
}
