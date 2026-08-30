import { useQuery, call } from '../lib/ipc';
import { relativeAge } from '../lib/format';
import type { HealthView } from '@shared/types';

/** FR-088: is it working, and if not, why. */
export function Health(): React.JSX.Element {
  const { data, loading } = useQuery<HealthView>('health:get');

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  if (!data) return <p className="text-[var(--color-ink-faint)]">Health unavailable.</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-[20px]">System health</h1>

      <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
        {data.perAccount.map((a) => (
          <li key={a.institutionId} className="flex items-center gap-4 bg-[var(--color-surface)] px-4 py-3">
            <div className="flex-1">
              <p className="text-[13px]">{a.institutionName}</p>
              <p className="text-[12px] text-[var(--color-ink-faint)]">
                Last successful sync {relativeAge(a.lastSuccessfulSync)}
                {a.recentFailures > 0 && ` · ${a.recentFailures} recent failures`}
              </p>
            </div>
            <span
              className={`text-[12px] ${
                a.status === 'healthy' ? 'text-[var(--color-ink-faint)]' : 'text-[var(--color-attention)]'
              }`}
            >
              {a.status === 'healthy' ? 'Connected' : a.status.replace('_', ' ')}
            </span>
          </li>
        ))}
      </ul>

      <section className="border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <p className="eyebrow">Metrics</p>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-[13px]">
          <dt className="text-[var(--color-ink-faint)]">Transactions processed</dt>
          <dd className="numeric text-right">{data.metrics.transactionsProcessed}</dd>
          <dt className="text-[var(--color-ink-faint)]">Resolved without the model</dt>
          <dd className="numeric text-right">
            {data.metrics.localResolutionRate === null
              ? '—'
              : `${Math.round(data.metrics.localResolutionRate * 100)}%`}
          </dd>
          <dt className="text-[var(--color-ink-faint)]">Dropped diagnostic events</dt>
          <dd className="numeric text-right">{data.metrics.droppedDiagnosticEvents}</dd>
        </dl>
      </section>

      <button
        type="button"
        onClick={() => void call('diagnostics:export', { destPath: '' })}
        className="border border-[var(--color-line)] px-3 py-2 text-[13px] hover:bg-[var(--color-surface-raised)]"
      >
        Export diagnostics
      </button>
      <p className="text-[12px] text-[var(--color-ink-faint)]">
        Diagnostics contain no merchant names, amounts, balances, or credentials.
      </p>
    </div>
  );
}
