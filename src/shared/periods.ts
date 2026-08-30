import { TZDate } from '@date-fns/tz';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addWeeks,
  addMonths,
  isSaturday,
  isSunday,
} from 'date-fns';

/**
 * Period boundary math in the user's local timezone.
 *
 * Boundaries must be computed locally, not in UTC: a "week" that starts at
 * 00:00 UTC would attribute Saturday evening spending to the following week for
 * a US user, which would silently corrupt the weekday/weekend comparison and
 * every weekly baseline.
 */

export type PeriodType = 'weekly' | 'monthly';

export interface PeriodRange {
  readonly start: Date;
  readonly end: Date;
}

function local(instant: Date, timeZone: string): TZDate {
  return new TZDate(instant, timeZone);
}

/** Week containing `instant`, Sunday-start, half-open [start, end). */
export function weekBoundaries(instant: Date, timeZone: string): PeriodRange {
  const zoned = local(instant, timeZone);
  return {
    start: new Date(startOfWeek(zoned, { weekStartsOn: 0 }).getTime()),
    end: new Date(endOfWeek(zoned, { weekStartsOn: 0 }).getTime() + 1),
  };
}

/** Calendar month containing `instant`, half-open [start, end). */
export function monthBoundaries(instant: Date, timeZone: string): PeriodRange {
  const zoned = local(instant, timeZone);
  return {
    start: new Date(startOfMonth(zoned).getTime()),
    end: new Date(endOfMonth(zoned).getTime() + 1),
  };
}

/** True when `instant` falls on a Saturday or Sunday locally. */
export function isWeekend(instant: Date, timeZone: string): boolean {
  const zoned = local(instant, timeZone);
  return isSaturday(zoned) || isSunday(zoned);
}

/**
 * Every period boundary strictly after `from` and at or before `to`.
 *
 * This is the mechanism behind FR-058: on launch, each returned boundary is a
 * digest or report whose scheduled time elapsed while the app was closed.
 */
export function elapsedPeriodsSince(
  from: Date,
  to: Date,
  period: PeriodType,
  timeZone: string,
): Date[] {
  const boundaries: Date[] = [];
  const step = period === 'weekly' ? addWeeks : addMonths;
  const first =
    period === 'weekly'
      ? weekBoundaries(from, timeZone).end
      : monthBoundaries(from, timeZone).end;

  let cursor = first;
  while (cursor.getTime() <= to.getTime()) {
    boundaries.push(cursor);
    const next = step(local(cursor, timeZone), 1);
    cursor =
      period === 'weekly'
        ? weekBoundaries(new Date(next.getTime()), timeZone).start
        : monthBoundaries(new Date(next.getTime()), timeZone).start;
  }
  return boundaries;
}
