import { useQuery, call } from '../lib/ipc';
import { Money } from '../components/Money';
import { EmptyState } from '../components/EmptyState';
import { shortDate } from '../lib/format';
import type { RecurringChargeView } from '@shared/types';

/** FR-021: the ledger. Cumulative total is the column that changes behaviour. */
export function Recurring(): React.JSX.Element {
  const { data, loading, refetch } = useQuery<RecurringChargeView[]>('recurring:list', {
    includeInactive: true,
  });

  const rescan = (
    <button
      type="button"
      onClick={() => void call('analysis:refresh').then(refetch)}
      className="border border-[var(--color-line)] px-3 py-1 text-[12px] hover:bg-[var(--color-surface-raised)]"
    >
      Rescan
    </button>
  );

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  if (!data || data.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[20px]">Recurring</h1>
          {rescan}
        </div>
        <EmptyState
          title="No recurring charges detected yet"
          detail="Subscriptions appear here once a repeating pattern is established, usually after two or three cycles. Rescan to check again now."
        />
      </div>
    );
  }

  const active = data.filter((c) => c.status === 'active');
  const monthlyTotal = active.reduce((sum, c) => sum + normalizeMonthly(c), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[20px]">Recurring</h1>
        <div className="flex items-center gap-3">
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            <Money minor={monthlyTotal} magnitude /> a month across {active.length}
          </p>
          {rescan}
        </div>
      </div>

      <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
        {data.map((c) => (
          <li
            key={c.id}
            className={`flex items-center gap-4 bg-[var(--color-surface)] px-4 py-3 ${
              c.status === 'inactive' ? 'opacity-50' : ''
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate">{c.merchantName}</p>
              <p className="text-[12px] text-[var(--color-ink-faint)]">
                {c.cadence} · since {shortDate(c.firstSeenDate)}
                {c.status === 'inactive' && ' · stopped'}
              </p>
            </div>
            {c.amountChanges.length > 0 && (
              <span className="text-[11px] text-[var(--color-attention)]">price changed</span>
            )}
            <div className="text-right">
              <Money minor={c.currentAmountMinor} magnitude className="block" />
              <span className="numeric text-[11px] text-[var(--color-ink-faint)]">
                <Money minor={c.cumulativePaidMinor} magnitude /> paid
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                void call('recurring:markNotRecurring', { id: c.id }).then(refetch);
              }}
              className="text-[12px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            >
              Not recurring
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Normalize each cadence to a monthly figure so the header total is comparable. */
function normalizeMonthly(c: RecurringChargeView): number {
  const perMonth: Record<string, number> = {
    weekly: 4.33,
    biweekly: 2.17,
    semimonthly: 2,
    monthly: 1,
    quarterly: 1 / 3,
    annual: 1 / 12,
  };
  return Math.round(c.currentAmountMinor * (perMonth[c.cadence] ?? 1));
}
