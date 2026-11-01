import { useQuery, call } from '../lib/ipc';
import { Money } from '../components/Money';
import { EmptyState } from '../components/EmptyState';
import { AddIncomeSource } from '../components/AddIncomeSource';
import type { IncomeSourceView } from '@shared/types';

/** FR-071: confirm or override a detected pattern. Detection is the default. */
export function Income({
  onOpenMerchant,
}: {
  onOpenMerchant: (merchantKey: string) => void;
}): React.JSX.Element {
  const { data, loading, refetch } = useQuery<IncomeSourceView[]>('income:list');

  const rescan = (
    <button
      type="button"
      onClick={() => void call('analysis:refresh').then(refetch)}
      className="btn"
    >
      Rescan
    </button>
  );

  const actions = (
    // `contents` lets the open form wrap onto its own full-width row in the header.
    <div className="contents">
      <AddIncomeSource onAdded={refetch} />
      {rescan}
    </div>
  );

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  if (!data || data.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-[20px]">Income</h1>
          {actions}
        </div>
        <EmptyState
          title="No recurring income detected yet"
          detail="Deposits are matched into a pattern automatically. Until one is found, balance projections are withheld rather than guessed. Rescan to check again now."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-[20px]">Income</h1>
        {actions}
      </div>
      <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
        {data.map((s) => (
          <li key={s.id} className="flex items-center gap-4 bg-[var(--color-surface)] px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate">{s.merchantName}</p>
              <p className="text-[12px] text-[var(--color-ink-faint)]">
                {s.cadence} · next {new Date(s.nextExpectedDate).toLocaleDateString()}
                {!s.isUserConfirmed && ` · ${Math.round(s.detectionConfidence * 100)}% confidence`}
              </p>
            </div>
            <Money minor={s.expectedAmountMinor} direction />
            <button type="button" onClick={() => onOpenMerchant(s.merchantKey)} className="btn">
              See deposits
            </button>
            {s.isUserConfirmed ? (
              <button
                type="button"
                onClick={() => {
                  void call('income:clearOverride', { id: s.id }).then(refetch);
                }}
                className="btn"
              >
                Unpin
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void call('income:confirm', { id: s.id }).then(refetch);
                }}
                className="btn"
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
