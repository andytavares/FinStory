import { elapsedPeriodsSince } from '@shared/periods';

/**
 * Catch-up planning.
 *
 * Correctness here is defined as complete catch-up, not uptime (research.md
 * R6). The app will routinely be closed; what must never happen is losing an
 * alert or silently skipping a scheduled report.
 */

export interface CatchUpInput {
  readonly lastRunAt: Date | null;
  readonly now: Date;
  readonly timeZone: string;
}

export interface CatchUpPlan {
  readonly needsSync: boolean;
  readonly missedWeeklyDigests: Date[];
  readonly missedMonthlyReports: Date[];
  readonly wasLongAbsence: boolean;
}

/** Beyond this, the absence is long enough that output should be labelled late. */
const LONG_ABSENCE_MS = 3 * 86_400_000;

export function planCatchUp(input: CatchUpInput): CatchUpPlan {
  if (!input.lastRunAt) {
    // First run: sync and backfill, but there is no history of missed periods.
    return {
      needsSync: true,
      missedWeeklyDigests: [],
      missedMonthlyReports: [],
      wasLongAbsence: false,
    };
  }

  const gap = input.now.getTime() - input.lastRunAt.getTime();
  return {
    // A sync always runs: a gap of minutes and a gap of weeks are the same call.
    needsSync: true,
    missedWeeklyDigests: elapsedPeriodsSince(input.lastRunAt, input.now, 'weekly', input.timeZone),
    missedMonthlyReports: elapsedPeriodsSince(input.lastRunAt, input.now, 'monthly', input.timeZone),
    wasLongAbsence: gap > LONG_ABSENCE_MS,
  };
}

export interface BacklogAlert {
  readonly id: string;
  readonly type: string;
  readonly eventOccurredAt: Date;
}

export interface BacklogSummary {
  readonly totalCount: number;
  readonly byType: Record<string, number>;
  readonly earliest: Date;
  readonly latest: Date;
}

export interface CollapseResult {
  readonly individual: BacklogAlert[];
  readonly summary: BacklogSummary | null;
}

/**
 * Collapse a large backlog into one "while you were away" summary.
 *
 * Thirty stale notifications arriving at once is noise the user will dismiss
 * wholesale, which defeats the point of alerting at all.
 */
export function collapseBacklogAlerts(
  alerts: readonly BacklogAlert[],
  options: { collapseThreshold: number },
): CollapseResult {
  if (alerts.length === 0) return { individual: [], summary: null };
  if (alerts.length < options.collapseThreshold) {
    return { individual: [...alerts], summary: null };
  }

  const byType: Record<string, number> = {};
  for (const a of alerts) {
    byType[a.type] = (byType[a.type] ?? 0) + 1;
  }
  const times = alerts.map((a) => a.eventOccurredAt.getTime());

  return {
    individual: [],
    summary: {
      totalCount: alerts.length,
      byType,
      earliest: new Date(Math.min(...times)),
      latest: new Date(Math.max(...times)),
    },
  };
}
