import { describe, it, expect } from 'vitest';
import { SystemClock, TestClock, type Clock } from '@shared/clock';

describe('clock: injectable time', () => {
  it('SystemClock reports a plausible current time', () => {
    const clock: Clock = new SystemClock();
    const before = Date.now();
    const now = clock.now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it('TestClock is fully deterministic', () => {
    const clock = new TestClock(new Date('2026-08-29T12:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-08-29T12:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-08-29T12:00:00.000Z');
  });

  it('TestClock advances by a duration', () => {
    const clock = new TestClock(new Date('2026-08-29T12:00:00Z'));
    clock.advanceMs(1000 * 60 * 60 * 24);
    expect(clock.now().toISOString()).toBe('2026-08-30T12:00:00.000Z');
  });

  it('TestClock can jump to an absolute instant, modelling a machine waking after sleep', () => {
    const clock = new TestClock(new Date('2026-08-01T09:00:00Z'));
    clock.setTo(new Date('2026-08-29T09:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-08-29T09:00:00.000Z');
  });

  it('TestClock refuses to move backwards', () => {
    const clock = new TestClock(new Date('2026-08-29T12:00:00Z'));
    expect(() => clock.setTo(new Date('2026-08-28T12:00:00Z'))).toThrow(/backwards/i);
    expect(() => clock.advanceMs(-1)).toThrow(/backwards/i);
  });

  it('returns a copy so callers cannot mutate clock state', () => {
    const clock = new TestClock(new Date('2026-08-29T12:00:00Z'));
    const first = clock.now();
    first.setFullYear(1999);
    expect(clock.now().getUTCFullYear()).toBe(2026);
  });
});
