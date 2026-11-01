import { Stat } from '../../components/ui';
import { categoryColor } from '../../lib/categoryColor';
import type { UsageSummary } from './types';

function eventsDelta({ totalEvents, previousTotal }: UsageSummary, days: number | null): string {
  if (days === null || previousTotal === 0) return '';
  const change = Math.round((totalEvents / previousTotal - 1) * 100);
  return `${change >= 0 ? '↑' : '↓'} ${Math.abs(change)}% vs prior ${days}`;
}

function FeatureStats({ summary }: { summary: UsageSummary }): React.JSX.Element {
  const share = Math.round((summary.featuresUsed / Math.max(1, summary.featuresTotal)) * 100);
  return (
    <>
      <Stat
        label="Features used"
        value={`${summary.featuresUsed} of ${summary.featuresTotal}`}
        delta={`${share}% of the app`}
        color="var(--color-positive)"
      />
      <Stat
        label="Never used"
        value={String(summary.neverUsed.length)}
        delta="See list below"
        tone="warn"
        color="var(--color-attention)"
      />
    </>
  );
}

export function UsageStats({
  summary,
  days,
}: {
  summary: UsageSummary;
  days: number | null;
}): React.JSX.Element {
  const perDay = summary.daily.map((d) => d.count);
  return (
    <div className="ds-grid grid-cols-4">
      <Stat
        label={days === null ? 'Events' : `Events, ${days} days`}
        value={String(summary.totalEvents)}
        delta={eventsDelta(summary, days)}
        tone="pos"
        series={perDay}
      />
      <FeatureStats summary={summary} />
      <Stat
        label="Active days"
        value={String(summary.activeDays)}
        delta={days === null ? '' : `of the last ${days}`}
        color={categoryColor(5)}
        series={perDay}
      />
    </div>
  );
}
