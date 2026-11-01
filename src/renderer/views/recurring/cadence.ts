import { shortDate } from '../../lib/format';

export const CADENCE_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Yearly',
};

/** "Monthly · since May 29" */
export function cadenceSince(cadence: string, firstSeen: string): string {
  return `${CADENCE_LABEL[cadence] ?? cadence} · since ${shortDate(firstSeen)}`;
}
