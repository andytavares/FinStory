import { detectCadence, type Cadence } from './cadence';
import { sumMinor } from '@shared/money';

/**
 * Recurring-charge detection and ledger reconciliation.
 *
 * Pure over passed-in data (Constitution XIII). Detection delegates to the
 * shared cadence detector so recurring charges and income cannot drift apart
 * (research.md R11).
 */

export interface RecurringObservation {
  readonly transactionId: string;
  readonly merchantKey: string;
  /** Negative = money out. */
  readonly amountMinor: number;
  readonly occurredAt: Date;
}

export interface DetectedRecurring {
  readonly merchantKey: string;
  readonly currentAmountMinor: number;
  readonly cadence: Cadence;
  readonly confidence: number;
  readonly firstSeenDate: Date;
  readonly lastSeenDate: Date;
  readonly cumulativePaidMinor: number;
  readonly occurrenceTransactionIds: string[];
}

export interface LedgerEntry {
  readonly id: string;
  readonly merchantKey: string;
  readonly currentAmountMinor: number;
  readonly cadence: Cadence;
  readonly firstSeenDate: Date;
  readonly lastSeenDate: Date;
  readonly cumulativePaidMinor: number;
  readonly status: 'active' | 'inactive';
  readonly userAcknowledged: boolean;
}

export interface AmountChange {
  readonly merchantKey: string;
  readonly oldAmountMinor: number;
  readonly newAmountMinor: number;
}

export interface Reconciliation {
  readonly newlyDetected: DetectedRecurring[];
  readonly amountChanges: AmountChange[];
  readonly deactivated: LedgerEntry[];
}

/** How far past its expected cadence a charge may drift before being inactive. */
const GRACE_MULTIPLIER = 1.5;

const CADENCE_DAYS: Readonly<Record<Cadence, number>> = {
  weekly: 7,
  biweekly: 14,
  semimonthly: 15.2,
  monthly: 30.4,
  quarterly: 91.3,
  annual: 365,
};

export function detectRecurringCharges(
  observations: readonly RecurringObservation[],
): DetectedRecurring[] {
  const byMerchant = new Map<string, RecurringObservation[]>();
  for (const o of observations) {
    // Debits only: income is detected separately, against credits.
    if (o.amountMinor >= 0) continue;
    byMerchant.set(o.merchantKey, [...(byMerchant.get(o.merchantKey) ?? []), o]);
  }

  const detected: DetectedRecurring[] = [];
  for (const [merchantKey, group] of byMerchant) {
    const cadence = detectCadence(
      group.map((o) => ({ occurredAt: o.occurredAt, amountMinor: Math.abs(o.amountMinor) })),
    );
    if (!cadence) continue;

    detected.push({
      merchantKey,
      currentAmountMinor: -cadence.amountMinor,
      cadence: cadence.cadence,
      confidence: cadence.confidence,
      firstSeenDate: cadence.firstSeen,
      lastSeenDate: cadence.lastSeen,
      cumulativePaidMinor: sumMinor(group.map((o) => o.amountMinor)),
      occurrenceTransactionIds: group.map((o) => o.transactionId),
    });
  }
  return detected;
}

/**
 * Compare detection against the stored ledger.
 *
 * Three outputs, each mapping to a requirement: charges the user has not seen
 * before (FR-022), charges whose price moved (FR-023), and charges that have
 * stopped (FR-024 — marked inactive, never deleted, so history survives).
 */
export function reconcileLedger(
  existing: readonly LedgerEntry[],
  detected: readonly DetectedRecurring[],
  asOf: Date,
): Reconciliation {
  const byKey = new Map(existing.map((e) => [e.merchantKey, e]));
  const detectedKeys = new Set(detected.map((d) => d.merchantKey));

  const newlyDetected: DetectedRecurring[] = [];
  const amountChanges: AmountChange[] = [];

  for (const d of detected) {
    const prior = byKey.get(d.merchantKey);
    if (!prior) {
      newlyDetected.push(d);
      continue;
    }
    if (prior.currentAmountMinor !== d.currentAmountMinor) {
      amountChanges.push({
        merchantKey: d.merchantKey,
        oldAmountMinor: prior.currentAmountMinor,
        newAmountMinor: d.currentAmountMinor,
      });
    }
  }

  const deactivated = existing.filter((e) => {
    if (e.status !== 'active') return false;
    if (detectedKeys.has(e.merchantKey)) return false;
    const overdueDays = (asOf.getTime() - e.lastSeenDate.getTime()) / 86_400_000;
    return overdueDays > CADENCE_DAYS[e.cadence] * GRACE_MULTIPLIER;
  });

  return { newlyDetected, amountChanges, deactivated };
}
