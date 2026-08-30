import { describe, it, expect } from 'vitest';
import { weekBoundaries, monthBoundaries, elapsedPeriodsSince, isWeekend } from '@shared/periods';

const TZ = 'America/New_York';

describe('periods: boundaries in the user local timezone', () => {
  it('computes a week boundary starting Sunday', () => {
    const { start, end } = weekBoundaries(new Date('2026-08-29T12:00:00Z'), TZ);
    expect(start.toISOString()).toBe('2026-08-23T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-30T04:00:00.000Z');
  });

  it('computes a month boundary', () => {
    const { start, end } = monthBoundaries(new Date('2026-08-29T12:00:00Z'), TZ);
    expect(start.toISOString()).toBe('2026-08-01T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-01T04:00:00.000Z');
  });

  it('handles a month boundary across a DST transition', () => {
    // US DST ends 2026-11-01; the November window must still be a whole month.
    const { start, end } = monthBoundaries(new Date('2026-11-15T12:00:00Z'), TZ);
    expect(start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-01T05:00:00.000Z');
  });

  it('identifies weekends for the weekday/weekend spending split', () => {
    expect(isWeekend(new Date('2026-08-29T12:00:00Z'), TZ)).toBe(true); // Saturday
    expect(isWeekend(new Date('2026-08-30T12:00:00Z'), TZ)).toBe(true); // Sunday
    expect(isWeekend(new Date('2026-08-28T12:00:00Z'), TZ)).toBe(false); // Friday
  });
});

describe('periods: elapsed periods drive catch-up (FR-058)', () => {
  it('reports zero when no boundary has passed', () => {
    const from = new Date('2026-08-24T12:00:00Z');
    const to = new Date('2026-08-25T12:00:00Z');
    expect(elapsedPeriodsSince(from, to, 'weekly', TZ)).toHaveLength(0);
  });

  it('reports every missed weekly boundary after a long absence', () => {
    const from = new Date('2026-08-01T12:00:00Z');
    const to = new Date('2026-08-29T12:00:00Z');
    const missed = elapsedPeriodsSince(from, to, 'weekly', TZ);
    // Four Sunday boundaries fall in this window.
    expect(missed).toHaveLength(4);
    expect(missed[0]?.toISOString()).toBe('2026-08-02T04:00:00.000Z');
  });

  it('reports missed monthly boundaries', () => {
    const from = new Date('2026-05-15T12:00:00Z');
    const to = new Date('2026-08-29T12:00:00Z');
    expect(elapsedPeriodsSince(from, to, 'monthly', TZ)).toHaveLength(3);
  });
});
