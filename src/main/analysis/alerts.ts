import { sumMinor } from '@shared/money';

/**
 * Alert rule evaluation.
 *
 * Pure function over passed-in data (Constitution XIII), which is what makes
 * the catch-up path safe: replaying a backlog runs exactly the same code as a
 * live batch, with previously-emitted dedupe keys passed in.
 */

export enum AlertType {
  LargePurchase = 'large_purchase',
  DailyTotal = 'daily_total',
  DuplicateCharge = 'duplicate_charge',
  NewRecurring = 'new_recurring',
  BalanceFloor = 'balance_floor',
}

export interface AlertRule {
  readonly id: string;
  readonly type: AlertType;
  readonly thresholdMinor: number | null;
  readonly windowMinutes: number | null;
  readonly enabled: boolean;
}

export interface AlertCandidate {
  readonly transactionId: string;
  /** Negative = money out. */
  readonly amountMinor: number;
  readonly merchantKey: string;
  readonly occurredAt: Date;
  readonly isInternalTransfer: boolean;
}

export interface FiredAlert {
  readonly ruleId: string;
  readonly type: AlertType;
  readonly triggeredByTransactionId: string | null;
  /** When the event actually happened — not when it was detected (FR-057). */
  readonly eventOccurredAt: Date;
  readonly dedupeKey: string;
}

/**
 * Deterministic key identifying the underlying event.
 *
 * A unique index on this column is what enforces FR-031: one event yields one
 * alert whether it is detected live or replayed from a backlog. Suppression
 * must be a database constraint, not application logic a catch-up path can
 * bypass.
 */
export function dedupeKeyFor(type: AlertType, discriminator: string): string {
  return `${type}:${discriminator}`;
}

function dayKey(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/** Spending only: money out, excluding internal transfers (FR-007). */
function isSpending(c: AlertCandidate): boolean {
  return c.amountMinor < 0 && !c.isInternalTransfer;
}

export function evaluateAlerts(
  candidates: readonly AlertCandidate[],
  rules: readonly AlertRule[],
  alreadyEmittedKeys: readonly string[],
): FiredAlert[] {
  const emitted = new Set(alreadyEmittedKeys);
  const fired: FiredAlert[] = [];
  const enabled = new Map(rules.filter((r) => r.enabled).map((r) => [r.type, r]));
  const spending = candidates.filter(isSpending);

  /**
   * One event yields one alert. When a single purchase satisfies several rules,
   * the most specific wins — an unusually large purchase is more informative
   * than the daily total it happens to push over the line (FR-031).
   */
  const claimedTransactions = new Set<string>();

  const add = (alert: FiredAlert): void => {
    // Claim the transaction even when the alert is suppressed as a duplicate.
    // The event still belongs to this rule; releasing it on replay would let a
    // broader rule fire spuriously for something already reported.
    if (alert.triggeredByTransactionId) claimedTransactions.add(alert.triggeredByTransactionId);
    if (emitted.has(alert.dedupeKey)) return;
    emitted.add(alert.dedupeKey);
    fired.push(alert);
  };

  // Large single purchase.
  const large = enabled.get(AlertType.LargePurchase);
  if (large?.thresholdMinor != null) {
    const threshold = large.thresholdMinor;
    for (const c of spending) {
      if (Math.abs(c.amountMinor) >= threshold) {
        add({
          ruleId: large.id,
          type: AlertType.LargePurchase,
          triggeredByTransactionId: c.transactionId,
          eventOccurredAt: c.occurredAt,
          dedupeKey: dedupeKeyFor(AlertType.LargePurchase, c.transactionId),
        });
      }
    }
  }

  // Duplicate charge: same merchant and amount inside the window.
  const dup = enabled.get(AlertType.DuplicateCharge);
  if (dup?.windowMinutes != null) {
    const windowMs = dup.windowMinutes * 60_000;
    const byMerchantAmount = new Map<string, AlertCandidate[]>();
    for (const c of spending) {
      const key = `${c.merchantKey}|${c.amountMinor}`;
      byMerchantAmount.set(key, [...(byMerchantAmount.get(key) ?? []), c]);
    }
    for (const group of byMerchantAmount.values()) {
      const ordered = [...group].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
      for (let i = 1; i < ordered.length; i += 1) {
        const prev = ordered[i - 1];
        const curr = ordered[i];
        if (!prev || !curr) continue;
        if (curr.occurredAt.getTime() - prev.occurredAt.getTime() > windowMs) continue;
        if (claimedTransactions.has(curr.transactionId)) continue;
        add({
          ruleId: dup.id,
          type: AlertType.DuplicateCharge,
          triggeredByTransactionId: curr.transactionId,
          eventOccurredAt: curr.occurredAt,
          dedupeKey: dedupeKeyFor(
            AlertType.DuplicateCharge,
            `${prev.transactionId}~${curr.transactionId}`,
          ),
        });
      }
    }
  }

  // Daily spend total, scoped per calendar day.
  const daily = enabled.get(AlertType.DailyTotal);
  if (daily?.thresholdMinor != null) {
    const threshold = daily.thresholdMinor;
    const byDay = new Map<string, AlertCandidate[]>();
    for (const c of spending) {
      const key = dayKey(c.occurredAt);
      byDay.set(key, [...(byDay.get(key) ?? []), c]);
    }
    for (const [day, group] of byDay) {
      // Suppress only when the day is *entirely* accounted for by transactions
      // that already alerted individually. "One event" means one transaction;
      // a day is a distinct event, so a day containing any unreported spending
      // still deserves its total (FR-031).
      if (group.every((c) => claimedTransactions.has(c.transactionId))) continue;
      const total = Math.abs(sumMinor(group.map((c) => c.amountMinor)));
      if (total < threshold) continue;
      const last = [...group].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()).at(-1);
      if (!last) continue;
      add({
        ruleId: daily.id,
        type: AlertType.DailyTotal,
        triggeredByTransactionId: null,
        eventOccurredAt: last.occurredAt,
        dedupeKey: dedupeKeyFor(AlertType.DailyTotal, day),
      });
    }
  }

  return fired;
}
