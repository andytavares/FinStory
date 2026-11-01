import { Stat } from '../../components/ui';
import { money, shortDate } from '../../lib/format';
import type { DashboardKpis } from '@shared/types';

interface Props {
  readonly kpis: DashboardKpis;
  readonly floorMinor: number;
  readonly now: Date;
}

/** Spend so far against the prior month's spend, scaled to the same day of the month. */
function spentDelta({ kpis, now }: Props): { text: string; tone: 'pos' | 'neg' | 'faint' } {
  const [prior] = kpis.spent.seriesMinor.slice(-2, -1);
  if (!prior) return { text: 'No prior month to compare', tone: 'faint' };
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const pace = (prior * now.getDate()) / daysInMonth;
  const change = Math.round(((kpis.spent.thisMonthMinor - pace) / pace) * 100);
  return {
    text: `${change <= 0 ? '↓' : '↑'} ${Math.abs(change)}% vs last month's pace`,
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
        label="Spent this month"
        value={money(kpis.spent.thisMonthMinor)}
        delta={spent.text}
        tone={spent.tone}
        series={kpis.spent.seriesMinor}
        color="var(--color-accent)"
      />
      <Stat
        label="Income this month"
        value={money(kpis.income.thisMonthMinor)}
        delta={deposit ? `Next: ${money(deposit.amountMinor)} on ${shortDate(deposit.date)}` : 'No deposit expected yet'}
        series={kpis.income.seriesMinor}
        color="var(--color-positive)"
      />
      <Stat
        label="Recurring / month"
        value={money(kpis.recurring.monthlyMinor)}
        delta={`${kpis.recurring.count} charges · ${kpis.recurring.candidateCount} to confirm`}
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
