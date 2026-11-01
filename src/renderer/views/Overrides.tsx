import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { EmptyState } from '../components/EmptyState';
import { shortDate } from '../lib/format';
import type { OverrideKind, OverrideRecord } from '@shared/types';

const GROUPS: ReadonlyArray<{ kind: OverrideKind; title: string; blurb: string }> = [
  {
    kind: 'merchant_name',
    title: 'Merchant renames',
    blurb: 'Applies to every transaction from this merchant, past and future.',
  },
  {
    kind: 'transaction_name',
    title: 'Single transaction renames',
    blurb: 'Applies to one transaction only.',
  },
  {
    kind: 'merchant_category',
    title: 'Merchant categories',
    blurb: 'Every future transaction from this merchant lands here automatically.',
  },
  {
    kind: 'transaction_category',
    title: 'Single transaction categories',
    blurb: 'A category you set by hand on one transaction.',
  },
  { kind: 'excluded', title: 'Excluded from totals', blurb: 'Kept on record, left out of every total.' },
  {
    kind: 'recurring_rule',
    title: 'Recurring decisions',
    blurb: 'Covers every instance of that charge, including ones that arrive later.',
  },
  {
    kind: 'recurring',
    title: 'Single transaction recurring flags',
    blurb: 'Set on one transaction rather than the whole charge.',
  },
  { kind: 'note', title: 'Notes', blurb: 'Your own text on a transaction.' },
];

/**
 * Every decision the user has made that overrides the app.
 *
 * Without this a rename or exclusion made months ago is invisible until it
 * shows up wrong in a report, with no way to find what caused it.
 */
export function Overrides(): React.JSX.Element {
  const { data, loading, refetch } = useQuery<OverrideRecord[]>('overrides:list');
  const [busy, setBusy] = useState<string | null>(null);

  const clear = async (record: OverrideRecord): Promise<void> => {
    setBusy(record.id);
    try {
      await call('overrides:clear', { kind: record.kind, target: record.target });
      refetch();
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  const records = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[20px]">Your overrides</h1>
        <span className="text-[12px] text-[var(--color-ink-faint)]">
          {records.length} {records.length === 1 ? 'override' : 'overrides'}
        </span>
      </div>

      {records.length === 0 ? (
        <EmptyState
          title="You have not overridden anything yet"
          detail="Renames, category corrections, exclusions and notes you make will be listed here so you can find and undo them."
        />
      ) : (
        GROUPS.map((group) => {
          const rows = records.filter((r) => r.kind === group.kind);
          if (rows.length === 0) return null;
          return (
            <section key={group.kind} className="space-y-2">
              <div>
                <p className="eyebrow">{group.title}</p>
                <p className="text-[12px] text-[var(--color-ink-faint)]">{group.blurb}</p>
              </div>
              <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start gap-4 bg-[var(--color-surface)] px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px]">{r.label}</p>
                      <p className="text-[12px] text-[var(--color-ink-faint)]">
                        {r.original === null ? r.current : `${r.original} → ${r.current}`}
                      </p>
                      <p className="text-[12px] text-[var(--color-ink-faint)]">
                        {r.affectedCount === 1
                          ? '1 transaction'
                          : `${r.affectedCount} transactions`}
                        {r.occurredAt && ` · ${shortDate(r.occurredAt)}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void clear(r)}
                      disabled={busy === r.id}
                      aria-label={`Undo override for ${r.label}`}
                      className="btn"
                    >
                      {busy === r.id ? 'Undoing…' : 'Undo'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      {records.length > 0 && (
        <p className="text-[12px] text-[var(--color-ink-faint)]">
          Undoing hands the decision back to the app. Nothing is deleted from your transaction
          history.
        </p>
      )}
    </div>
  );
}
