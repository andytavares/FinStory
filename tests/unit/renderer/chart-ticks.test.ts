import { describe, it, expect } from 'vitest';
import { axisMoney, axisDay, axisPeriod } from '../../../src/renderer/lib/format';

describe('chart axis labels', () => {
  it('shows thousands as $Nk, as in the approved charts', () => {
    expect(axisMoney(0)).toBe('$0');
    expect(axisMoney(150_000)).toBe('$1.5k');
    expect(axisMoney(200_000)).toBe('$2k');
    expect(axisMoney(45_000)).toBe('$450');
  });

  it('shows a calendar day as "Nov 5" without shifting it by time zone', () => {
    expect(axisDay('2026-11-05')).toBe('Nov 5');
    expect(axisDay('2026-01-01')).toBe('Jan 1');
  });

  it('shows a month period as its short name and leaves other labels alone', () => {
    expect(axisPeriod('2026-06')).toBe('Jun');
    expect(axisPeriod('Week of Oct 5')).toBe('Week of Oct 5');
  });
});
