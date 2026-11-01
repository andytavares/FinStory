import { describe, it, expect } from 'vitest';
import { nextExpectedDate } from '@main/analysis/recurring-schedule';

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
