import type { RecurringChargeView } from '@shared/types';

type AmountChange = RecurringChargeView['amountChanges'][number];

/** Absolute prices, oldest first, ending at the current price. */
export function priceHistory(changes: readonly AmountChange[], currentMinor: number): number[] {
  const ordered = [...changes].sort((a, b) => a.changedAt.localeCompare(b.changedAt));
  const first = ordered[0];
  if (!first) return [Math.abs(currentMinor), Math.abs(currentMinor)];
  return [Math.abs(first.oldAmountMinor), ...ordered.map((c) => Math.abs(c.newAmountMinor))];
}

/** The latest change that raised the price, or null when none did. */
export function latestRise(changes: readonly AmountChange[]): AmountChange | null {
  const rises = changes.filter((c) => Math.abs(c.newAmountMinor) > Math.abs(c.oldAmountMinor));
  return rises.sort((a, b) => b.changedAt.localeCompare(a.changedAt))[0] ?? null;
}
