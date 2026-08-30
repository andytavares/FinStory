import { detectRecurringCharges, reconcileLedger } from './recurring';
import type { AmountChange, DetectedRecurring, LedgerEntry } from './recurring';
import { detectIncomeSources } from './income';
import type { IncomeSource } from './income';

/**
 * The analysis pass.
 *
 * Recurring-charge and income detection were built and tested but nothing ever
 * ran them, so both ledgers stayed permanently empty. This is the pass that
 * turns stored transactions into those ledgers; it runs after every sync and on
 * demand.
 *
 * Pure over passed-in data (Constitution XIII): the caller loads and persists.
 */

export interface AnalysisTransaction {
  readonly id: string;
  readonly accountId: string;
  readonly merchantKey: string | null;
  readonly amountMinor: number;
  readonly postedDate: string;
  readonly datetime: string | null;
  readonly isInternalTransfer: boolean;
  readonly settlementState: 'pending' | 'posted' | 'removed';
  readonly userRecurringOverride: 'recurring' | 'not_recurring' | null;
}

export interface AnalysisInput {
  readonly transactions: readonly AnalysisTransaction[];
  readonly existingRecurring: readonly LedgerEntry[];
  readonly existingIncome: readonly IncomeSource[];
  readonly asOf: Date;
}

export interface AnalysisResult {
  readonly recurring: DetectedRecurring[];
  readonly newlyDetected: DetectedRecurring[];
  readonly amountChanges: AmountChange[];
  readonly deactivated: LedgerEntry[];
  readonly income: IncomeSource[];
}

function occurredAt(t: AnalysisTransaction): Date {
  return new Date(t.datetime ?? `${t.postedDate}T12:00:00Z`);
}

export function runAnalysisPass(input: AnalysisInput): AnalysisResult {
  // Transfers and removed rows are not spending, and a user override is
  // authoritative over detection either way.
  const suppressed = new Set(
    input.transactions
      .filter((t) => t.userRecurringOverride === 'not_recurring')
      .map((t) => t.merchantKey)
      .filter((k): k is string => k !== null),
  );

  const usable = input.transactions.filter(
    (t) =>
      t.merchantKey !== null &&
      !t.isInternalTransfer &&
      t.settlementState !== 'removed' &&
      !suppressed.has(t.merchantKey),
  );

  const recurring = detectRecurringCharges(
    usable
      .filter((t) => t.amountMinor < 0)
      .map((t) => ({
        transactionId: t.id,
        merchantKey: t.merchantKey ?? '',
        amountMinor: t.amountMinor,
        occurredAt: occurredAt(t),
      })),
  );

  const reconciliation = reconcileLedger(input.existingRecurring, recurring, input.asOf);

  const detectedIncome = detectIncomeSources(
    usable
      .filter((t) => t.amountMinor > 0)
      .map((t) => ({
        transactionId: t.id,
        accountId: t.accountId,
        merchantKey: t.merchantKey ?? '',
        amountMinor: t.amountMinor,
        occurredAt: occurredAt(t),
      })),
  );

  // A confirmed income source is pinned: the user's answer outranks detection
  // until they clear it (FR-071).
  const confirmed = new Map(
    input.existingIncome.filter((s) => s.isUserConfirmed).map((s) => [s.merchantKey, s]),
  );
  const income = [
    ...detectedIncome.map((s) => confirmed.get(s.merchantKey) ?? s),
    ...[...confirmed.values()].filter(
      (s) => !detectedIncome.some((d) => d.merchantKey === s.merchantKey),
    ),
  ];

  return {
    recurring,
    newlyDetected: reconciliation.newlyDetected,
    amountChanges: reconciliation.amountChanges,
    deactivated: reconciliation.deactivated,
    income,
  };
}
