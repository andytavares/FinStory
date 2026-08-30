import { describe, it, expect } from 'vitest';
import { classifyByHeuristic } from '@main/categorization/heuristics';
import { CategorizationPipeline } from '@main/categorization/pipeline';
import { defaultCategories } from '@main/db/seed-categories';

describe('merchant heuristics: the floor beneath history and the model', () => {
  const cases: ReadonlyArray<[string, string]> = [
    ['UBER EATS', 'dining'],
    ['DOORDASH*ORDER', 'dining'],
    ['STARBUCKS #1123', 'coffee'],
    ['TRADER JOES #445', 'groceries'],
    ['WHOLE FOODS MKT', 'groceries'],
    ['UBER TRIP 8XK2', 'rideshare'],
    ['SHELL OIL 5567', 'fuel'],
    ['NETFLIX.COM', 'streaming'],
    ['SPOTIFY USA', 'streaming'],
    ['APPLE.COM/BILL ICLOUD', 'software'],
    ['VERIZON WIRELESS', 'utilities'],
    ['CVS PHARMACY #221', 'pharmacy'],
    ['DELTA AIR LINES', 'travel'],
    ['HOME DEPOT #402', 'home'],
    ['AMC THEATRES', 'entertainment'],
    ['ATM WITHDRAWAL', 'uncategorizable'],
  ];

  for (const [descriptor, expected] of cases) {
    it(`categorizes ${descriptor} as ${expected}`, () => {
      expect(classifyByHeuristic(descriptor)?.categoryId).toBe(expected);
    });
  }

  it('distinguishes Uber rides from Uber Eats', () => {
    expect(classifyByHeuristic('UBER EATS')?.categoryId).toBe('dining');
    expect(classifyByHeuristic('UBER TRIP')?.categoryId).toBe('rideshare');
  });

  it('returns null for a merchant it does not know', () => {
    expect(classifyByHeuristic('ZZQQ MERCHANT 8817')).toBeNull();
  });

  it('stays below the review threshold, so the user can correct it', () => {
    expect(classifyByHeuristic('NETFLIX.COM')?.confidence).toBeLessThan(0.8);
  });

  it('only names categories that exist in the shipped taxonomy', () => {
    const known = new Set(defaultCategories().map((c) => c.id));
    for (const [descriptor] of cases) {
      const match = classifyByHeuristic(descriptor);
      expect(known.has(match?.categoryId ?? ''), `${descriptor} -> ${match?.categoryId}`).toBe(true);
    }
  });
});

describe('a fresh import is usable with no model and no history', () => {
  const pipeline = (): CategorizationPipeline =>
    new CategorizationPipeline(
      { classify: () => Promise.reject(new Error('no model configured')) },
      { confidenceThreshold: 0.8, localOnly: true },
    );

  it('does NOT mark a well-known merchant uncategorizable', async () => {
    const r = await pipeline().categorize({
      transactionId: 't1',
      descriptor: 'UBER EATS',
      amountMinor: -3421,
      occurredAt: new Date('2026-08-29T20:00:00Z'),
    });
    expect(r.categoryId).toBe('dining');
    expect(r.needsReview).toBe(true);
  });

  it('categorizes a realistic first import instead of dumping it all in one bucket', async () => {
    const p = pipeline();
    const descriptors = [
      'UBER EATS', 'STARBUCKS #99', 'TRADER JOES', 'SHELL OIL', 'NETFLIX.COM',
      'VERIZON WIRELESS', 'CVS PHARMACY', 'AMC THEATRES', 'HOME DEPOT', 'DELTA AIR LINES',
      'ZZQQ UNKNOWN 1', 'ZZQQ UNKNOWN 2',
    ];
    const results = await Promise.all(
      descriptors.map((d, i) =>
        p.categorize({
          transactionId: `t${i}`,
          descriptor: d,
          amountMinor: -1000,
          occurredAt: new Date('2026-08-29T12:00:00Z'),
        }),
      ),
    );
    const uncategorized = results.filter((r) => r.categoryId === 'uncategorizable');
    // Only the two genuinely unknown merchants should fall through.
    expect(uncategorized).toHaveLength(2);
  });

  it('explains why when nothing can be determined', async () => {
    const r = await pipeline().categorize({
      transactionId: 't1',
      descriptor: 'ZZQQ MERCHANT',
      amountMinor: -1000,
      occurredAt: new Date('2026-08-29T12:00:00Z'),
    });
    expect(r.categoryId).toBe('uncategorizable');
    expect(r.reasoning).toMatch(/no model configured/i);
  });

  it('falls back to heuristics when the model errors, not to uncategorizable', async () => {
    const p = new CategorizationPipeline(
      { classify: () => Promise.reject(new Error('API down')) },
      { confidenceThreshold: 0.8 },
    );
    const r = await p.categorize({
      transactionId: 't1',
      descriptor: 'NETFLIX.COM',
      amountMinor: -1599,
      occurredAt: new Date('2026-08-29T12:00:00Z'),
    });
    expect(r.categoryId).toBe('streaming');
  });

  it('prefers learned history over a heuristic', async () => {
    const p = pipeline();
    p.loadProfile({
      merchantKey: 'starbucks',
      categoryDistribution: { groceries: 6 },
      userConfirmedCategoryId: null,
      transactionCount: 6,
    });
    const r = await p.categorize({
      transactionId: 't1',
      descriptor: 'STARBUCKS #1123',
      amountMinor: -637,
      occurredAt: new Date('2026-08-29T12:00:00Z'),
    });
    expect(r.categoryId).toBe('groceries');
  });
});
