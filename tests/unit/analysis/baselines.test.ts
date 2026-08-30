import { describe, it, expect } from 'vitest';
import { computeBaseline, describeDeviation, MIN_PERIODS_FOR_BASELINE } from '@main/analysis/baselines';

describe('baselines: sufficiency gate (FR-040, Constitution IX)', () => {
  it('is insufficient below the minimum sample', () => {
    const b = computeBaseline([1000, 1100]);
    expect(b.isSufficient).toBe(false);
    expect(b.samplePeriods).toBe(2);
  });

  it('becomes sufficient at the minimum sample', () => {
    const b = computeBaseline(Array.from({ length: MIN_PERIODS_FOR_BASELINE }, () => 1000));
    expect(b.isSufficient).toBe(true);
  });

  it('is insufficient with no history at all', () => {
    expect(computeBaseline([]).isSufficient).toBe(false);
  });

  it('computes mean and standard deviation in minor units', () => {
    const b = computeBaseline([1000, 2000, 3000, 4000]);
    expect(b.meanMinor).toBe(2500);
    expect(b.stddevMinor).toBeGreaterThan(0);
    expect(Number.isInteger(b.stddevMinor)).toBe(true);
  });
});

describe('baselines: deviation reporting must not invent anomalies', () => {
  const sufficient = computeBaseline([10000, 11000, 9000, 10500, 9500, 10200]);

  it('reports no deviation claim when the baseline is insufficient', () => {
    const thin = computeBaseline([10000, 11000]);
    const d = describeDeviation(50000, thin);
    expect(d.hasClaim).toBe(false);
    expect(d.multiple).toBeNull();
  });

  it('still reports the plain total when the baseline is insufficient (US4 AS2)', () => {
    const d = describeDeviation(50000, computeBaseline([10000]));
    expect(d.actualMinor).toBe(50000);
  });

  it('makes a claim when spending is far above a sufficient baseline', () => {
    const d = describeDeviation(31000, sufficient);
    expect(d.hasClaim).toBe(true);
    expect(d.direction).toBe('above');
    expect(d.multiple).toBeCloseTo(3.06, 1);
  });

  it('makes no claim for ordinary variation within the normal range', () => {
    const d = describeDeviation(10300, sufficient);
    expect(d.hasClaim).toBe(false);
  });

  it('detects a drop below the normal range', () => {
    const d = describeDeviation(1000, sufficient);
    expect(d.hasClaim).toBe(true);
    expect(d.direction).toBe('below');
  });

  it('handles a zero baseline without dividing by zero', () => {
    const zero = computeBaseline([0, 0, 0, 0, 0, 0]);
    const d = describeDeviation(5000, zero);
    expect(d.multiple).toBeNull();
    expect(Number.isFinite(d.actualMinor)).toBe(true);
  });
});
