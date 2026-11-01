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

      {/* An empty dashboard has two very different causes: nothing was imported,
          or everything imported sits in an account excluded from day-to-day
          money. These counts say which. */}
      <section className="border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <p className="eyebrow">What is stored</p>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-[13px]">
          <dt className="text-[var(--color-ink-faint)]">Connected institutions</dt>
          <dd className="numeric text-right">{data.contents.institutions}</dd>
          <dt className="text-[var(--color-ink-faint)]">Accounts</dt>
          <dd className="numeric text-right">{data.contents.accounts}</dd>
          <dt className="text-[var(--color-ink-faint)]">Marked day-to-day</dt>
          <dd className="numeric text-right">{data.contents.everydayAccounts}</dd>
          <dt className="text-[var(--color-ink-faint)]">Transactions imported</dt>
          <dd className="numeric text-right">{data.contents.transactions}</dd>
          <dt className="text-[var(--color-ink-faint)]">In day-to-day accounts</dt>
          <dd className="numeric text-right">{data.contents.transactionsInEverydayAccounts}</dd>
          <dt className="text-[var(--color-ink-faint)]">This month</dt>
          <dd className="numeric text-right">{data.contents.transactionsThisMonth}</dd>
          <dt className="text-[var(--color-ink-faint)]">Categorized</dt>
          <dd className="numeric text-right">{data.contents.categorized}</dd>
          <dt className="text-[var(--color-ink-faint)]">Still uncategorizable</dt>
          <dd className="numeric text-right">{data.contents.uncategorizable}</dd>
        </dl>
        {data.contents.transactions === 0 && (
          <p className="mt-3 text-[12px] text-[var(--color-ink-faint)]">
            Nothing has been imported yet, which is why every screen is empty. Use Sync now on the
            Accounts screen — it reports exactly what Plaid said.
          </p>
        )}
        {data.contents.transactions > 0 && data.contents.transactionsInEverydayAccounts === 0 && (
          <p className="mt-3 text-[12px] text-[var(--color-ink-faint)]">
            Every imported transaction sits in an account not marked day-to-day, so spending totals
            read zero. Turn accounts back on under Accounts.
          </p>
        )}
      </section>

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
        className="btn"
      >
        Export diagnostics
      </button>
      <p className="text-[12px] text-[var(--color-ink-faint)]">
        Diagnostics contain no merchant names, amounts, balances, or credentials.
      </p>
    </div>
  );
}
