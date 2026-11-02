import { periodLabel } from '../../lib/format';
import type { ReportSummary } from './types';

export const DAY_MS = 86_400_000;

function utcDay(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', ...options });
}

/** "Oct 26 – Nov 1", or "Sep 1 – 30" inside one month. The stored end is exclusive. */
export function periodRange({ periodStart, periodEnd }: Pick<ReportSummary, 'periodStart' | 'periodEnd'>): string {
  const lastDay = new Date(new Date(periodEnd).getTime() - DAY_MS).toISOString();
  const from = utcDay(periodStart, { month: 'short', day: 'numeric' });
  const sameMonth = utcDay(periodStart, { month: 'short' }) === utcDay(lastDay, { month: 'short' });
  const to = utcDay(lastDay, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
  return `${from} – ${to}`;
}

const monthOf = (report: Pick<ReportSummary, 'periodStart' | 'periodEnd'>): string =>
  periodLabel(report.periodStart, report.periodEnd).split(' ')[0] ?? '';

export function reportTitle(report: ReportSummary): string {
  if (report.type === 'weekly_digest') return 'Weekly digest';
  if (report.type === 'custom') return report.label ?? periodRange(report);
  return `${monthOf(report)} report`;
}

export const TYPE_NAMES: Record<ReportSummary['type'], string> = {
  weekly_digest: 'Weekly digest',
  monthly_report: 'Monthly report',
  custom: 'Custom range',
};
