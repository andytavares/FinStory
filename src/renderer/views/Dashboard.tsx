import { useState } from 'react';
import { useQuery } from '../lib/ipc';
import { Qualification } from '../components/Qualification';
import { EmptyState } from '../components/EmptyState';
import { Runway } from '../components/Runway';
import { CategoryTree, groupByParent } from '../components/CategoryTree';
import { Card, PageHeader, Segmented } from '../components/ui';
import { CategoryDonut } from '../charts/CategoryDonut';
import { SpendingOverTime } from '../charts/SpendingOverTime';
import { KpiTiles } from './dashboard/KpiTiles';
import { ComingUp } from './dashboard/ComingUp';
import { LOOKBACK_LABEL, PERIOD_OPTIONS, periodRange, periodSubtitle, type DashboardPeriod } from './dashboard/period';
import type { DashboardExtras, DashboardResponse } from '@shared/types';

interface DashboardData extends DashboardResponse, DashboardExtras {
  readonly runway: {
    available: boolean;
    currentBalanceMinor: number;
    projectedMinor: number | null;
    floorMinor: number;
    nextIncomeDate: string | null;
    reason: string;
  };
}

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  return hour < 18 ? 'Good afternoon' : 'Good evening';
}

// SC-019: state your position in 30 seconds: headline figures and runway first, then where the money went.
// Week / Month / Year sets the figures, series, "where it went" and category tree; not Runway or Coming up.
export function Dashboard({
  onDrill,
  onReconnect,
}: {
  onDrill: (categoryId: string) => void;
  onReconnect?: (() => void) | undefined;
}): React.JSX.Element {
  const now = new Date();
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const { data, loading, error } = useQuery<DashboardData>('dashboard:get', {
    ...periodRange(now, period),
    period,
  });

  // A year back, so the trend has something to show.
  const trends = useQuery<{
    series: Array<{ label: string; spendingMinor: number }>;
    priorAverageMinor: number | null;
  }>('trends:overTime', {
    periodStart: new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString(),
    periodEnd: periodRange(now, 'month').periodEnd,
  });

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  if (error) return <EmptyState title="Could not load your dashboard" detail={error} />;
  if (!data) return <EmptyState title="No data yet" detail="Connect an account to get started." />;

  const { categoryBreakdown } = data;
  const groups = groupByParent(categoryBreakdown.rows);

  return (
    <div className="ds-grid">
      <PageHeader
        title={greeting(now)}
        sub={periodSubtitle(now, period)}
        actions={<Segmented label="Period" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />}
      />
      <Qualification
        dataComplete={data.dataComplete}
        staleInstitutions={data.staleInstitutions}
        onReconnect={onReconnect}
      />
      <KpiTiles kpis={data.kpis} floorMinor={data.runway.floorMinor} now={now} period={period} />

      <div className="ds-grid" style={{ gridTemplateColumns: '1.25fr 1fr' }}>
        <Runway
          available={data.runway.available}
          projectedMinor={data.runway.projectedMinor}
          reason={data.runway.reason}
          series={data.runwaySeries}
        />
        <Card title="Where it went" caption={LOOKBACK_LABEL[period]}>
          {data.whereItWent.length === 0 ? (
            <p className="ds-muted" style={{ margin: '10px 0 0' }}>
              Nothing spent in the {LOOKBACK_LABEL[period].toLowerCase()}.
            </p>
          ) : (
            <CategoryDonut legend parts={data.whereItWent.map((g) => ({ name: g.name, value: g.spentMinor }))} />
          )}
        </Card>
      </div>

      <div className="ds-grid" style={{ gridTemplateColumns: '1.25fr 1fr' }}>
        <Card>
          {trends.data && trends.data.series.length > 1 ? (
            <SpendingOverTime
              data={trends.data.series}
              priorAverageMinor={trends.data.priorAverageMinor}
              title="Spending by month"
            />
          ) : (
            <p className="ds-muted">Not enough history yet to chart spending by month.</p>
          )}
        </Card>
        <ComingUp charges={data.upcomingRecurring} />
      </div>

      <Card title="By category" caption={`${groups.length} groups · amount and transactions counted`}>
        {categoryBreakdown.rows.length === 0 ? (
          <EmptyState
            title={`Nothing spent this ${period} yet`}
            detail="Transactions appear here automatically as they post. There is nothing to enter."
          />
        ) : (
          <CategoryTree rows={categoryBreakdown.rows} onDrill={onDrill} />
        )}
      </Card>

      {data.whatChanged.length > 0 && (
        <Card title="What changed">
          <ul className="ds-muted m-0 list-none space-y-1 p-0 pt-2">
            {data.whatChanged.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
