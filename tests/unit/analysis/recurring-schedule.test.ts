import { describe, it, expect } from 'vitest';
import { nextExpectedDate, yearlyCostMinor, monthlyCostMinor } from '@main/analysis/recurring-schedule';

describe('nextExpectedDate', () => {
  it('keeps a month-end charge in the next month', () => {
    expect(nextExpectedDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(nextExpectedDate('2028-01-31', 'monthly')).toBe('2028-02-29');
    expect(nextExpectedDate('2026-11-30', 'quarterly')).toBe('2027-02-28');
    expect(nextExpectedDate('2028-02-29', 'annual')).toBe('2029-02-28');
  });

  it('moves ordinary days by the cadence', () => {
    expect(nextExpectedDate('2026-01-15', 'monthly')).toBe('2026-02-15');
    expect(nextExpectedDate('2026-12-28', 'weekly')).toBe('2027-01-04');
  });
});

describe('cadences the detector stores beyond the four calendar ones', () => {
  it('moves a biweekly charge 14 days and a semimonthly one half a month', () => {
    expect(nextExpectedDate('2026-10-23', 'biweekly')).toBe('2026-11-06');
    expect(nextExpectedDate('2026-10-01', 'semimonthly')).toBe('2026-10-16');
    expect(nextExpectedDate('2026-10-16', 'semimonthly')).toBe('2026-11-01');
  });

  it('costs a biweekly charge 26 times a year and a semimonthly one 24 times', () => {
    expect(yearlyCostMinor(-1000, 'biweekly')).toBe(26_000);
    expect(yearlyCostMinor(-1000, 'semimonthly')).toBe(24_000);
    expect(monthlyCostMinor(-1200, 'semimonthly')).toBe(2_400);
  });
});
