import { describe, it, expect } from 'vitest';
import { detectCadence } from '@main/analysis/cadence';
import { series, irregular } from '../../fixtures/builders';

describe('cadence detection: recurring patterns', () => {
  it('detects a monthly subscription', () => {
    const r = detectCadence(series({ start: '2026-01-15', count: 8, everyDays: 30, amountMinor: 1599 }));
    expect(r?.cadence).toBe('monthly');
    expect(r?.amountMinor).toBe(1599);
    expect(r?.confidence).toBeGreaterThan(0.8);
  });

  it('detects a weekly charge', () => {
    const r = detectCadence(series({ start: '2026-01-05', count: 12, everyDays: 7, amountMinor: 1200 }));
    expect(r?.cadence).toBe('weekly');
  });

  it('detects a biweekly deposit — the income case', () => {
    const r = detectCadence(series({ start: '2026-01-02', count: 10, everyDays: 14, amountMinor: 260000 }));
    expect(r?.cadence).toBe('biweekly');
  });

  it('detects a quarterly charge', () => {
    const r = detectCadence(series({ start: '2026-01-10', count: 5, everyDays: 91, amountMinor: 4500 }));
    expect(r?.cadence).toBe('quarterly');
  });

  it('detects an annual charge', () => {
    const r = detectCadence(series({ start: '2022-03-01', count: 4, everyDays: 365, amountMinor: 9900 }));
    expect(r?.cadence).toBe('annual');
  });

  it('tolerates a few days of billing-date drift', () => {
    const r = detectCadence(
      series({ start: '2026-01-15', count: 8, everyDays: 30, amountMinor: 1599, jitterDays: 2 }),
    );
    expect(r?.cadence).toBe('monthly');
  });

  it('tolerates small amount variation, as a metered bill has', () => {
    const r = detectCadence(
      series({ start: '2026-01-15', count: 8, everyDays: 30, amountMinor: 8000, amountJitterMinor: 200 }),
    );
    expect(r?.cadence).toBe('monthly');
  });
});

describe('cadence detection: rejects non-recurring (FR-025)', () => {
  it('rejects irregular repeat purchases at one merchant', () => {
    // A grocery store: frequent, but neither evenly spaced nor consistent.
    expect(
      detectCadence(
        irregular({
          start: '2026-01-01',
          offsetsDays: [0, 3, 4, 11, 13, 20, 27, 28, 40, 41],
          amountsMinor: [4312, 11890, 2201, 7654, 9903],
        }),
      ),
    ).toBeNull();
  });

  it('rejects too few occurrences to establish a pattern', () => {
    expect(detectCadence(series({ start: '2026-01-15', count: 2, everyDays: 30, amountMinor: 1599 }))).toBeNull();
  });

  it('rejects an empty series', () => {
    expect(detectCadence([])).toBeNull();
  });

  it('rejects wildly varying amounts even at a regular interval', () => {
    const s = series({ start: '2026-01-15', count: 8, everyDays: 30, amountMinor: 5000 });
    s.forEach((o, i) => ((o as { amountMinor: number }).amountMinor = 1000 + i * 4000));
    expect(detectCadence(s)).toBeNull();
  });
});

describe('cadence edge cases', () => {
  it('rejects a single occurrence', () => {
    expect(detectCadence([{ occurredAt: new Date('2026-01-01'), amountMinor: 1000 }])).toBeNull();
  });

  it('rejects a series whose median amount is zero', () => {
    const zeros = Array.from({ length: 6 }, (_, i) => ({
      occurredAt: new Date(2026, 0, 1 + i * 30),
      amountMinor: 0,
    }));
    expect(detectCadence(zeros)).toBeNull();
  });

  it('rejects gaps that match no known cadence', () => {
    const odd = Array.from({ length: 6 }, (_, i) => ({
      occurredAt: new Date(2026, 0, 1 + i * 200),
      amountMinor: 1000,
    }));
    expect(detectCadence(odd)).toBeNull();
  });

  it('rejects when one gap falls outside tolerance even if the median fits', () => {
    const mostlyMonthly = [0, 30, 60, 90, 200].map((d) => ({
      occurredAt: new Date(2026, 0, 1 + d),
      amountMinor: 1599,
    }));
    expect(detectCadence(mostlyMonthly)).toBeNull();
  });

  it('reports occurrence count and interval', () => {
    const r = detectCadence(
      Array.from({ length: 6 }, (_, i) => ({
        occurredAt: new Date(2026, 0, 1 + i * 7),
        amountMinor: 1200,
      })),
    );
    expect(r?.occurrences).toBe(6);
    expect(r?.intervalDays).toBeCloseTo(7, 1);
  });
});
