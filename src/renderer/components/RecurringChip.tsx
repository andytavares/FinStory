import { RefreshCw } from 'lucide-react';

/**
 * Marks a transaction as part of a recurring charge.
 *
 * Shape and a label, not colour: colour is reserved for status here, and this
 * is a fact about the transaction rather than something wrong with it.
 */
export function RecurringChip(): React.JSX.Element {
  return (
    <span
      title="Part of a recurring charge"
      className="icon inline-flex shrink-0 items-center gap-1 border border-[var(--color-line)] px-1.5 py-0.5 text-[11px] text-[var(--color-ink-faint)] [&>svg]:h-3 [&>svg]:w-3"
    >
      <RefreshCw aria-hidden />
      Recurring
    </span>
  );
}
