import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/ui';
import { Money } from '../components/Money';
import type { RecurringCandidateView } from '@shared/types';
import { ChargeCard } from './recurring/ChargeCard';
import { cadenceSince } from './recurring/cadence';

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
      <p className="ds-caption">
        Same payee, same amount, on a regular interval. Answering once applies to every instance of
        that charge, including ones that arrive later.
      </p>
      {note && (
        <p role="status" className="ds-caption">
          {note}
        </p>
      )}
      <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {candidates.map((c) => (
          <ChargeCard
            key={c.key}
            markName={c.merchantName}
            name={c.merchantName}
            subtitle={cadenceSince(c.cadence, c.firstSeen)}
            amountMinor={c.amountMinor}
            history={[Math.abs(c.amountMinor), Math.abs(c.amountMinor)]}
            footer={
              <span className="ds-caption">
                Seen {c.occurrences} times · <Money minor={c.totalPaidMinor} magnitude /> so far ·{' '}
                {Math.round(c.confidence * 100)}% confident
              </span>
            }
          >
            <Button
              size="sm"
              variant="primary"
              disabled={busy === c.key}
              onClick={() => void decide(c, 'recurring')}
              aria-label={`Mark ${c.merchantName} recurring`}
            >
              Yes, recurring
            </Button>
            <Button
              size="sm"
              disabled={busy === c.key}
              onClick={() => void decide(c, 'not_recurring')}
              aria-label={`Mark ${c.merchantName} not recurring`}
            >
              Not recurring
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onOpenMerchant(c.merchantKey)}>
              See transactions
            </Button>
          </ChargeCard>
        ))}
      </div>
    </div>
  );
}
