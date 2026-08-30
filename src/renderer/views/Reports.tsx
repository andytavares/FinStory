import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { Money } from '../components/Money';
import { EmptyState } from '../components/EmptyState';

interface ReportSummary {
  readonly id: string;
  readonly type: 'weekly_digest' | 'monthly_report';
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly dataComplete: boolean;
  readonly wasLate: boolean;
  readonly totalSpendingMinor: number;
  readonly savingsRate: number;
}

/** FR-038: the monthly read. Ten minutes, once a month, is the whole budget. */
export function Reports(): React.JSX.Element {
  const { data, loading, refetch } = useQuery<ReportSummary[]>('reports:list', { type: 'all', limit: 24 });
  const [generating, setGenerating] = useState<string | null>(null);
  const [generated, setGenerated] = useState<string | null>(null);

  const generate = async (type: 'weekly_digest' | 'monthly_report'): Promise<void> => {
    setGenerating(type);
    setGenerated(null);
    try {
      await call('reports:generate', { type });
      refetch();
      setGenerated(type === 'monthly_report' ? 'Monthly report ready.' : 'Weekly digest ready.');
    } finally {
      setGenerating(null);
    }
  };

  const controls = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={generating !== null}
        onClick={() => void generate('weekly_digest')}
        className="border border-[var(--color-line)] px-3 py-1 text-[12px] hover:bg-[var(--color-surface-raised)] disabled:opacity-40"
      >
        Run weekly digest
      </button>
      <button
        type="button"
        disabled={generating !== null}
        onClick={() => void generate('monthly_report')}
        className="border border-[var(--color-line)] px-3 py-1 text-[12px] hover:bg-[var(--color-surface-raised)] disabled:opacity-40"
      >
        Run monthly report
      </button>
    </div>
  );

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  if (!data || data.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[20px]">Reports</h1>
          {controls}
        </div>
        {generated && <p className="text-[13px] text-[var(--color-ink-muted)]">{generated}</p>}
        <EmptyState
          title="No reports yet"
          detail="A digest arrives weekly and a full report monthly, generated whether or not the app is open. You can also run one now."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[20px]">Reports</h1>
        {controls}
      </div>
      {generated && <p className="text-[13px] text-[var(--color-ink-muted)]">{generated}</p>}
      <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
        {data.map((r) => (
          <li key={r.id} className="flex items-center gap-4 bg-[var(--color-surface)] px-4 py-3">
            <div className="flex-1">
              <p className="text-[13px]">
                {new Date(r.periodStart).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
              <p className="text-[12px] text-[var(--color-ink-faint)]">
                {r.type === 'monthly_report' ? 'Monthly report' : 'Weekly digest'}
                {r.wasLate && ' · generated late'}
                {!r.dataComplete && ' · incomplete data'}
              </p>
            </div>
            <div className="text-right">
              <Money minor={r.totalSpendingMinor} magnitude className="block" />
              <span className="numeric text-[11px] text-[var(--color-ink-faint)]">
                {Math.round(r.savingsRate * 100)}% saved
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
