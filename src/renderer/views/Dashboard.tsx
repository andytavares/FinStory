import { useQuery } from '../lib/ipc';
import { Money } from '../components/Money';
import { Qualification } from '../components/Qualification';
import { EmptyState } from '../components/EmptyState';
import { Runway } from '../components/Runway';
import { CategoryBars } from '../charts/CategoryBars';
import { CategoryTree, groupByParent } from '../components/CategoryTree';
import { SpendingOverTime } from '../charts/SpendingOverTime';
import { useQuery as useTrends } from '../lib/ipc';
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

  // A year back, so the trend has something to show.
  const trends = useTrends<{
    series: Array<{ label: string; spendingMinor: number }>;
    priorAverageMinor: number | null;
  }>('trends:overTime', {
    periodStart: new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString(),
    periodEnd,
  });

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  if (error) return <EmptyState title="Could not load your dashboard" detail={error} />;
  if (!data) return <EmptyState title="No data yet" detail="Connect an account to get started." />;

  const { cashFlowMinor, categoryBreakdown } = data;

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

      {categoryBreakdown.rows.length > 0 && (
        <section>
          {/* Charted at the parent level: a dozen subcategories is noise when
              the question is "which part of my life cost the most". */}
          <CategoryBars
            data={groupByParent(categoryBreakdown.rows).map((g) => ({
              categoryId: g.id,
              categoryName: g.name,
              totalMinor: g.totalMinor,
            }))}
            title="Where it went"
            onSelect={onDrill}
          />
        </section>
      )}

      {trends.data && trends.data.series.length > 1 && (
        <section>
          <SpendingOverTime
            data={trends.data.series}
            priorAverageMinor={trends.data.priorAverageMinor}
            title="Spending by month"
          />
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[15px]">By category</h2>
          <p className="text-[12px] text-[var(--color-ink-faint)]">
            {groupByParent(categoryBreakdown.rows).length} groups · expand for detail
          </p>
        </div>

        {categoryBreakdown.rows.length === 0 ? (
          <EmptyState
            title="Nothing spent this month yet"
            detail="Transactions appear here automatically as they post. There is nothing to enter."
          />
        ) : (
          <CategoryTree rows={categoryBreakdown.rows} onDrill={onDrill} />
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
