import { Stat } from '../../components/ui';
import { money, shortDate } from '../../lib/format';
import { elapsedFraction, type DashboardPeriod } from './period';
import type { DashboardKpis } from '@shared/types';

interface Props {
  readonly kpis: DashboardKpis;
  readonly floorMinor: number;
  readonly now: Date;
  readonly period: DashboardPeriod;
}

/** Spend so far against the prior period's spend, scaled to the same stretch of it. */
function spentDelta({ kpis, now, period }: Props): { text: string; tone: 'pos' | 'neg' | 'faint' } {
  const [prior] = kpis.spent.seriesMinor.slice(-2, -1);
  if (!prior) return { text: 'No prior period to compare', tone: 'faint' };
  const pace = prior * elapsedFraction(now, period);
  const change = Math.round(((kpis.spent.currentMinor - pace) / pace) * 100);
  return {
    text: `${change <= 0 ? '↓' : '↑'} ${Math.abs(change)}% vs last ${period}'s pace`,
    tone: change <= 0 ? 'pos' : 'neg',
  };
}

export function KpiTiles(props: Props): React.JSX.Element {
  const { kpis, floorMinor } = props;
  const spent = spentDelta(props);
  const deposit = kpis.income.nextDeposit;
  const safe = kpis.safeToSpendPerDayMinor;
  return (
    <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
      <Stat
        label={`Spent this ${props.period}`}
        value={money(kpis.spent.currentMinor)}
        delta={spent.text}
        tone={spent.tone}
        series={kpis.spent.seriesMinor}
        color="var(--color-accent)"
      />
      <Stat
        label={`Income this ${props.period}`}
        value={money(kpis.income.currentMinor)}
        delta={deposit ? `Next: ${money(deposit.amountMinor)} on ${shortDate(deposit.date)}` : 'No deposit expected yet'}
        series={kpis.income.seriesMinor}
        color="var(--color-positive)"
      />
      <Stat
        label="Recurring / month"
        value={money(kpis.recurring.monthlyMinor)}
        delta={`${kpis.recurring.count} charges · ${kpis.recurring.candidateCount} to confirm`}
        series={kpis.recurring.seriesMinor}
        color="var(--color-cat-6)"
      />
      <Stat
        label="Safe to spend / day"
        value={safe === null ? '—' : money(safe)}
        delta={safe === null ? 'Needs a known payday' : `Keeps you above ${money(floorMinor)}`}
        tone={safe === null ? 'faint' : 'pos'}
        color="var(--color-attention)"
      />
    </div>
  );
}
