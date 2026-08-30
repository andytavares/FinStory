import { useQuery, call } from '../lib/ipc';
import { Money } from '../components/Money';
import { EmptyState } from '../components/EmptyState';
import type { IncomeSourceView } from '@shared/types';

/** FR-071: confirm or override a detected pattern. Detection is the default. */
export function Income(): React.JSX.Element {
  const { data, loading } = useQuery<IncomeSourceView[]>('income:list');

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="No recurring income detected yet"
        detail="Deposits are matched into a pattern automatically. Until one is found, balance projections are withheld rather than guessed."
      />
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-[20px]">Income</h1>
      <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
        {data.map((s) => (
          <li key={s.id} className="flex items-center gap-4 bg-[var(--color-surface)] px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate">{s.merchantKey}</p>
              <p className="text-[12px] text-[var(--color-ink-faint)]">
                {s.cadence} · next {new Date(s.nextExpectedDate).toLocaleDateString()}
                {!s.isUserConfirmed && ` · ${Math.round(s.detectionConfidence * 100)}% confidence`}
              </p>
            </div>
            <Money minor={s.expectedAmountMinor} />
            {s.isUserConfirmed ? (
              <button
                type="button"
                onClick={() => void call('income:clearOverride', { id: s.id })}
                className="text-[12px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
              >
                Unpin
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void call('income:confirm', { id: s.id })}
                className="border border-[var(--color-line)] px-3 py-1 text-[12px] hover:bg-[var(--color-surface-raised)]"
              >
                Confirm
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
