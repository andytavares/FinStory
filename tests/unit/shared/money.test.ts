import { describe, it, expect } from 'vitest';
import {
  toMinor,
  fromMinor,
  addMinor,
  sumMinor,
  negateMinor,
  formatMinor,
  parseMinorFromDecimalString,
  isMoneyAmount,
} from '@shared/money';

describe('money: minor-unit representation', () => {
  it('converts a major-unit decimal to integer minor units', () => {
    expect(toMinor(43.12)).toBe(4312);
    expect(toMinor(0.01)).toBe(1);
    expect(toMinor(0)).toBe(0);
  });

  it('rounds half away from zero rather than truncating', () => {
    // 0.005 must not silently become 0 — under-reporting money is a defect.
    expect(toMinor(0.005)).toBe(1);
    expect(toMinor(-0.005)).toBe(-1);
    expect(toMinor(1.005)).toBe(101);
  });

  it('handles the classic float representation traps exactly', () => {
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(toMinor(1.1)).toBe(110);
    expect(toMinor(4.35)).toBe(435);
  });

  it('represents negative amounts (money out) without loss', () => {
    expect(toMinor(-12.47)).toBe(-1247);
    expect(fromMinor(-1247)).toBe(-12.47);
  });

  it('round-trips through minor units', () => {
    for (const v of [0, 0.01, 1, 12.47, 847.0, 3200.55, -43.12]) {
      expect(fromMinor(toMinor(v))).toBe(v);
    }
  });
});

describe('money: arithmetic is exact', () => {
  it('adds without float drift', () => {
    expect(addMinor(1047, 2), 'ten forty-seven plus two cents').toBe(1049);
    // The failure mode this module exists to prevent: 0.1 + 0.2 !== 0.3
    expect(addMinor(toMinor(0.1), toMinor(0.2))).toBe(toMinor(0.3));
  });

  it('sums a large set of small amounts exactly', () => {
    const amounts = Array.from({ length: 2847 }, () => 1247); // $12.47 x 2847
    expect(sumMinor(amounts)).toBe(1247 * 2847);
  });

  it('sums an empty set to zero', () => {
    expect(sumMinor([])).toBe(0);
  });

  it('negates', () => {
    expect(negateMinor(4312)).toBe(-4312);
    expect(negateMinor(0)).toBe(0);
  });

  it('rejects non-integer minor units at the boundary', () => {
    expect(() => addMinor(1.5, 2)).toThrow(/integer minor units/i);
    expect(() => sumMinor([1, 2.5])).toThrow(/integer minor units/i);
  });

  it('rejects unsafe integers rather than silently losing precision', () => {
    expect(() => addMinor(Number.MAX_SAFE_INTEGER, 1)).toThrow(/safe integer/i);
  });
});

describe('money: parsing and formatting', () => {
  it('parses a decimal string without going through a float', () => {
    expect(parseMinorFromDecimalString('43.12')).toBe(4312);
    expect(parseMinorFromDecimalString('0.07')).toBe(7);
    expect(parseMinorFromDecimalString('-12.47')).toBe(-1247);
    expect(parseMinorFromDecimalString('1000')).toBe(100000);
    expect(parseMinorFromDecimalString('5.1')).toBe(510);
  });

  it('rejects malformed money strings', () => {
    for (const bad of ['', 'abc', '1.234', '1.2.3', '--1', '1,000.00']) {
      expect(() => parseMinorFromDecimalString(bad), bad).toThrow();
    }
  });

  it('formats minor units as USD for display', () => {
    expect(formatMinor(4312)).toBe('$43.12');
    expect(formatMinor(0)).toBe('$0.00');
    expect(formatMinor(-1247)).toBe('-$12.47');
    expect(formatMinor(100000)).toBe('$1,000.00');
    expect(formatMinor(7)).toBe('$0.07');
  });

  it('identifies valid money amounts', () => {
    expect(isMoneyAmount(100)).toBe(true);
    expect(isMoneyAmount(-100)).toBe(true);
    expect(isMoneyAmount(1.5)).toBe(false);
    expect(isMoneyAmount(Number.NaN)).toBe(false);
    expect(isMoneyAmount(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
