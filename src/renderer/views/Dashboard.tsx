import { useQuery } from '../lib/ipc';
import { Money } from '../components/Money';
import { Qualification } from '../components/Qualification';
import { EmptyState } from '../components/EmptyState';
import { Runway } from '../components/Runway';
import type { DashboardResponse } from '@shared/types';

interface DashboardData extends DashboardResponse {
  readonly runway: {
    available: boolean;
    currentBalanceMinor: number;
    projectedMinor: number | null;
    floorMinor: number;
    nextIncomeDate: string | null;
    reason: string;
  };
}

/**
 * SC-019: a user can state their position within 30 seconds without navigating
 * away. So the page leads with the runway (the actual question), then cash
 * flow, then where the money went — in that order of usefulness.
 */
export function Dashboard({ onDrill }: { onDrill: (categoryId: string) => void }): React.JSX.Element {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const { data, loading, error } = useQuery<DashboardData>('dashboard:get', {
    periodStart,
    periodEnd,
  });

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  if (error) return <EmptyState title="Could not load your dashboard" detail={error} />;
  if (!data) return <EmptyState title="No data yet" detail="Connect an account to get started." />;

  const { cashFlowMinor, categoryBreakdown } = data;
  const largest = categoryBreakdown.rows[0]?.totalMinor ?? -1;

  return (
    <div className="space-y-6">
      <Qualification
        dataComplete={data.dataComplete}
        staleInstitutions={data.staleInstitutions}
      />

      <Runway {...data.runway} />

      <section className="grid grid-cols-3 gap-px bg-[var(--color-line)]">
        {[
          { label: 'In', value: cashFlowMinor.incomeMinor },
          { label: 'Out', value: cashFlowMinor.spendingMinor },
          { label: 'Net', value: cashFlowMinor.netMinor },
        ].map((cell) => (
          <div key={cell.label} className="bg-[var(--color-surface)] px-5 py-4">
            <p className="eyebrow">{cell.label} this month</p>
            <Money minor={cell.value} magnitude={cell.label !== 'Net'} className="mt-1 block text-[22px]" />
          </div>
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[15px]">Where it went</h2>
          <p className="text-[12px] text-[var(--color-ink-faint)]">
            {categoryBreakdown.rows.length} categories
          </p>
        </div>

        {categoryBreakdown.rows.length === 0 ? (
          <EmptyState
            title="Nothing spent this month yet"
            detail="Transactions appear here automatically as they post. There is nothing to enter."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
            {categoryBreakdown.rows.map((row) => (
              <li key={row.categoryId}>
                {/* SC-018: one interaction from any figure to its transactions. */}
                <button
                  type="button"
                  onClick={() => onDrill(row.categoryId)}
                  className="flex w-full items-center gap-4 bg-[var(--color-surface)] px-4 py-3 text-left hover:bg-[var(--color-surface-raised)]"
                >
                  <span className="w-40 shrink-0 truncate">{row.name}</span>
                  {/* Bar encodes share of the largest category — comparison, not decoration. */}
                  <span className="h-1 flex-1 bg-[var(--color-surface-raised)]">
                    <span
                      className="block h-full bg-[var(--color-ink-faint)]"
                      style={{ width: `${(row.totalMinor / largest) * 100}%` }}
                    />
                  </span>
                  <Money minor={row.totalMinor} magnitude className="w-28 text-right" />
                  <span className="numeric w-10 text-right text-[12px] text-[var(--color-ink-faint)]">
                    {row.txCount}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.whatChanged.length > 0 && (
        <section>
          <h2 className="mb-2 text-[15px]">What changed</h2>
          <ul className="space-y-1 text-[13px] text-[var(--color-ink-muted)]">
            {data.whatChanged.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
