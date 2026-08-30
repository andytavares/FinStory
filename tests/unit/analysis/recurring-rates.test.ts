import { describe, it, expect } from 'vitest';
import { detectRecurringCharges } from '@main/analysis/recurring';
import type { RecurringObservation } from '@main/analysis/recurring';
import { series, irregular } from '../../fixtures/builders';

/** SC-005: 95% recall on genuine recurring charges, under 10% false positives. */

const TRUE_RECURRING: ReadonlyArray<[string, number, number]> = [
  ['netflix', 30, 1599],
  ['spotify', 30, 1199],
  ['icloud', 30, 299],
  ['gym', 30, 4500],
  ['insurance', 91, 45000],
  ['domain', 365, 1800],
  ['rent', 30, 220000],
  ['phone', 30, 8500],
  ['internet', 30, 7000],
  ['newspaper', 30, 1500],
  ['storage', 30, 9500],
  ['software', 365, 9900],
  ['water', 91, 12000],
  ['streaming2', 30, 999],
  ['cloudbackup', 30, 599],
  ['podcast', 30, 500],
  ['vpn', 365, 4900],
  ['meal-kit', 7, 6900],
  ['carwash', 30, 2000],
  ['charity', 30, 2500],
];

const DECOYS: ReadonlyArray<[string, number[], number[]]> = [
  ['trader-joes', [0, 3, 4, 11, 13, 20, 27, 28, 40, 41], [4312, 11890, 2201, 7654, 9903]],
  ['amazon', [0, 2, 9, 10, 22, 35, 36, 51], [1247, 3175, 899, 4500, 2299]],
  ['uber-eats', [0, 1, 6, 8, 15, 19, 26, 33], [2890, 3421, 1955, 4102, 2733]],
  ['shell', [0, 8, 17, 29, 44, 58], [5210, 4890, 5533, 4102, 6001]],
  ['target', [0, 12, 19, 34, 47], [4782, 11250, 2201, 8890, 3175]],
];

function obs(key: string, inputs: ReturnType<typeof series>): RecurringObservation[] {
  return inputs.map((i, n) => ({
    transactionId: `txn_${key}_${n}`,
    merchantKey: key,
    amountMinor: -Math.abs(i.amountMinor),
    occurredAt: i.occurredAt,
  }));
}

describe('SC-005: recurring detection rates', () => {
  const observations: RecurringObservation[] = [
    ...TRUE_RECURRING.flatMap(([key, everyDays, amountMinor]) =>
      obs(key, series({ start: '2024-01-15', count: everyDays > 300 ? 4 : 8, everyDays, amountMinor })),
    ),
    ...DECOYS.flatMap(([key, offsetsDays, amountsMinor]) =>
      obs(key, irregular({ start: '2026-01-01', offsetsDays, amountsMinor })),
    ),
  ];

  const detected = detectRecurringCharges(observations);
  const detectedKeys = new Set(detected.map((d) => d.merchantKey));

  it('achieves at least 95% recall on genuine recurring charges', () => {
    const found = TRUE_RECURRING.filter(([key]) => detectedKeys.has(key));
    const recall = found.length / TRUE_RECURRING.length;
    const missed = TRUE_RECURRING.filter(([key]) => !detectedKeys.has(key)).map(([k]) => k);
    expect(recall, `recall ${(recall * 100).toFixed(1)}%; missed: ${missed.join(', ')}`).toBeGreaterThanOrEqual(0.95);
  });

  it('keeps false positives under 10%', () => {
    const falsePositives = DECOYS.filter(([key]) => detectedKeys.has(key));
    const rate = falsePositives.length / detected.length;
    expect(
      rate,
      `false positive rate ${(rate * 100).toFixed(1)}%; wrongly flagged: ${falsePositives.map(([k]) => k).join(', ')}`,
    ).toBeLessThan(0.1);
  });
});
