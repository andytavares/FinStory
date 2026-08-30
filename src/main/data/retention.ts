import { subMonths } from 'date-fns';

/**
 * Retention policy (FR-050).
 *
 * 24 months is the minimum that supports year-over-year comparison. Pruning is
 * bounded by this floor: nothing inside the window may be removed, because
 * removing it would silently change historical totals.
 */
export const RETENTION_MONTHS = 24;

export function retentionCutoff(now: Date): Date {
  return subMonths(now, RETENTION_MONTHS);
}

export function isWithinRetention(postedAt: Date, now: Date): boolean {
  return postedAt.getTime() >= retentionCutoff(now).getTime();
}

export interface DatedRow {
  readonly id: string;
  readonly postedDate: string;
}

/** Rows outside the retention window. Returned, never deleted here. */
export function prunable<T extends DatedRow>(rows: readonly T[], now: Date): T[] {
  const cutoff = retentionCutoff(now).getTime();
  return rows.filter((r) => new Date(r.postedDate).getTime() < cutoff);
}
