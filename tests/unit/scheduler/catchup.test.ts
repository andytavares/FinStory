import { describe, it, expect } from 'vitest';
import { planCatchUp, collapseBacklogAlerts } from '@main/scheduler/catchup';
import type { BacklogAlert } from '@main/scheduler/catchup';

const TZ = 'America/New_York';

describe('catch-up planning (FR-056, FR-058)', () => {
  it('plans nothing when the app was only briefly closed', () => {
    const plan = planCatchUp({
      lastRunAt: new Date('2026-08-29T10:00:00Z'),
      now: new Date('2026-08-29T10:30:00Z'),
      timeZone: TZ,
    });
    expect(plan.missedWeeklyDigests).toHaveLength(0);
    expect(plan.missedMonthlyReports).toHaveLength(0);
    expect(plan.needsSync).toBe(true);
  });

  it('plans every missed weekly digest after a long absence', () => {
    const plan = planCatchUp({
      lastRunAt: new Date('2026-08-01T10:00:00Z'),
      now: new Date('2026-08-29T10:00:00Z'),
      timeZone: TZ,
    });
    expect(plan.missedWeeklyDigests.length).toBeGreaterThanOrEqual(3);
  });

  it('plans missed monthly reports', () => {
    const plan = planCatchUp({
      lastRunAt: new Date('2026-05-15T10:00:00Z'),
      now: new Date('2026-08-29T10:00:00Z'),
      timeZone: TZ,
    });
    expect(plan.missedMonthlyReports).toHaveLength(3);
  });

  it('treats a first run with no prior timestamp as sync-only', () => {
    const plan = planCatchUp({ lastRunAt: null, now: new Date('2026-08-29T10:00:00Z'), timeZone: TZ });
    expect(plan.needsSync).toBe(true);
    expect(plan.missedWeeklyDigests).toHaveLength(0);
  });

  it('marks a long absence so reports can be labelled late (FR-057)', () => {
    const plan = planCatchUp({
      lastRunAt: new Date('2026-08-01T10:00:00Z'),
      now: new Date('2026-08-29T10:00:00Z'),
      timeZone: TZ,
    });
    expect(plan.wasLongAbsence).toBe(true);
  });
});

describe('backlog alert collapse (FR-031, burst edge case)', () => {
  function alert(n: number, occurredAt: string): BacklogAlert {
    return { id: `a${n}`, type: 'large_purchase', eventOccurredAt: new Date(occurredAt) };
  }

  it('delivers a small backlog individually', () => {
    const r = collapseBacklogAlerts(
      [alert(1, '2026-08-28T10:00:00Z'), alert(2, '2026-08-29T10:00:00Z')],
      { collapseThreshold: 5 },
    );
    expect(r.individual).toHaveLength(2);
    expect(r.summary).toBeNull();
  });

  it('collapses a large backlog into one summary', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      alert(i, `2026-08-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`),
    );
    const r = collapseBacklogAlerts(many, { collapseThreshold: 5 });
    expect(r.individual).toHaveLength(0);
    expect(r.summary?.totalCount).toBe(30);
    expect(r.summary?.byType['large_purchase']).toBe(30);
  });

  it('reports the span the summary covers so it is not mistaken for live', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      alert(i, `2026-08-${String(i + 1).padStart(2, '0')}T10:00:00Z`),
    );
    const r = collapseBacklogAlerts(many, { collapseThreshold: 5 });
    expect(r.summary?.earliest.toISOString().slice(0, 10)).toBe('2026-08-01');
    expect(r.summary?.latest.toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  it('handles an empty backlog', () => {
    const r = collapseBacklogAlerts([], { collapseThreshold: 5 });
    expect(r.individual).toHaveLength(0);
    expect(r.summary).toBeNull();
  });
});
