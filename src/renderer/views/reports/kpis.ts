import { money, signedMoney, spend } from '../../lib/format';
import { categoryColor } from '../../lib/categoryColor';
import type { StatTone } from '../../components/ui';
import type { KpiPoint, MonthlyContent } from './detailTypes';

export interface KpiTile {
  readonly label: string;
  readonly value: string;
  readonly delta: string;
  readonly tone: StatTone;
  readonly series: number[];
  readonly color: string;
}

const monthName = (point: KpiPoint): string =>
  new Date(point.periodStart).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

/** Out against the mean of the earlier periods, e.g. "↑ 70% vs avg". */
function outDelta(history: readonly KpiPoint[], current: KpiPoint): string {
  const earlier = history.filter((p) => p !== current).map((p) => Math.abs(p.totalSpendingMinor));
  const average = earlier.reduce((a, b) => a + b, 0) / (earlier.length || 1);
  if (earlier.length === 0 || average === 0) return '';
  const change = Math.round((Math.abs(current.totalSpendingMinor) / average - 1) * 100);
  return `${change >= 0 ? '↑' : '↓'} ${Math.abs(change)}% vs avg`;
}

export function kpiTiles(content: MonthlyContent, history: readonly KpiPoint[]): KpiTile[] {
  const current = history[history.length - 1];
  const previous = history[history.length - 2];
  const rate = Math.round(content.savingsRate * 1000) / 10;
  return [
    { label: 'In', delta: '', value: signedMoney(content.totalIncomeMinor), tone: 'pos', color: 'var(--color-positive)', series: history.map((p) => p.totalIncomeMinor) },
    { label: 'Out', delta: current ? outDelta(history, current) : '', value: spend(content.totalSpendingMinor), tone: 'neg', color: 'var(--color-accent)', series: history.map((p) => Math.abs(p.totalSpendingMinor)), },
    { label: 'Saved', delta: '', value: money(content.savingsMinor), tone: 'faint', color: categoryColor(5), series: history.map((p) => p.savingsMinor) },
    { label: 'Savings rate', delta: previous ? `was ${Math.round(previous.savingsRate * 100)}% in ${monthName(previous)}` : '', value: `${rate}%`, tone: previous && content.savingsRate < previous.savingsRate ? 'warn' : 'faint', color: 'var(--color-attention)', series: history.map((p) => p.savingsRate * 100) },
  ];
}

export function previousMonthName(history: readonly KpiPoint[]): string {
  const previous = history[history.length - 2];
  return previous ? new Date(previous.periodStart).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }) : 'last period';
}
