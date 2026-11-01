import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { Money } from '../components/Money';
import { EmptyState } from '../components/EmptyState';
import { shortDate } from '../lib/format';
import type { RecurringCandidateView } from '@shared/types';

const CADENCE_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Yearly',
};

/**
 * Charges that look recurring, waiting on an answer.
 *
 * Same payee, same amount, at a plausible interval. Answering once settles it
 * for every instance of that charge — including the ones that have not arrived
 * yet, so the same question is never asked twice.
 */
export function RecurringCandidates({
  onOpenMerchant,
  onDecided,
}: {
  onOpenMerchant: (merchantKey: string) => void;
  onDecided: () => void;
}): React.JSX.Element {
  const { data, loading, refetch } = useQuery<RecurringCandidateView[]>('recurring:candidates');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const decide = async (
    candidate: RecurringCandidateView,
    decision: 'recurring' | 'not_recurring',
  ): Promise<void> => {
    setBusy(candidate.key);
    try {
      const result = await call<{ marked: number }>('recurring:decide', {
        merchantKey: candidate.merchantKey,
        amountMinor: candidate.amountMinor,
        decision,
        cadence: candidate.cadence,
      });
      setNote(
        decision === 'recurring'
          ? `${candidate.merchantName} marked recurring across ${result.marked} transaction${result.marked === 1 ? '' : 's'}.`
          : `${candidate.merchantName} will not be suggested again.`,
      );
      refetch();
      onDecided();
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  const candidates = data ?? [];

  if (candidates.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting on you"
        detail="A charge is suggested here when the same payee bills the same amount on a regular interval. Everything found so far has been answered."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-[var(--color-ink-faint)]">
        Same payee, same amount, on a regular interval. Answering once applies to every instance of
        that charge, including ones that arrive later.
      </p>
      {note && (
        <p role="status" className="text-[12px] text-[var(--color-ink-faint)]">
          {note}
        </p>
      )}
      <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
        {candidates.map((c) => (
          <li key={c.key} className="bg-[var(--color-surface)] px-4 py-3">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px]">{c.merchantName}</p>
                <p className="text-[12px] text-[var(--color-ink-faint)]">
                  {CADENCE_LABEL[c.cadence] ?? c.cadence} · seen {c.occurrences} times ·{' '}
                  {shortDate(c.firstSeen)} to {shortDate(c.lastSeen)}
                </p>
                <p className="text-[12px] text-[var(--color-ink-faint)]">
                  Next expected {shortDate(c.nextExpected)} ·{' '}
                  {Math.round(c.confidence * 100)}% confident
                </p>
              </div>
              <div className="text-right">
                <Money minor={c.amountMinor} magnitude className="block" />
                <span className="text-[11px] text-[var(--color-ink-faint)]">
                  <Money minor={c.totalPaidMinor} magnitude /> so far
                </span>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-4 text-[12px]">
              <button
                type="button"
                disabled={busy === c.key}
                onClick={() => void decide(c, 'recurring')}
                aria-label={`Mark ${c.merchantName} recurring`}
                className="btn"
              >
                Yes, recurring
              </button>
              <button
                type="button"
                disabled={busy === c.key}
                onClick={() => void decide(c, 'not_recurring')}
                aria-label={`Mark ${c.merchantName} not recurring`}
                className="btn"
              >
                Not recurring
              </button>
              <button
                type="button"
                onClick={() => onOpenMerchant(c.merchantKey)}
                className="btn"
              >
                See transactions
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
