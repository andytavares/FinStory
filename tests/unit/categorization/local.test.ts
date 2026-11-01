import { describe, it, expect } from 'vitest';
import { classifyLocally, normalizeMerchantKey, updateProfile } from '@main/categorization/local';
import type { MerchantProfile } from '@main/categorization/local';

const profile = (o: Partial<MerchantProfile> = {}): MerchantProfile => ({
  merchantKey: 'target',
  categoryDistribution: { groceries: 60, home: 25, clothing: 15 },
  userConfirmedCategoryId: null,
  transactionCount: 100,
  ...o,
});

describe('merchant key normalization', () => {
  it('strips noise so the same merchant matches across descriptor variants', () => {
    const k = normalizeMerchantKey('SQ *BLUE BOTTLE COFFEE #1234');
    expect(normalizeMerchantKey('SQ *BLUE BOTTLE COFFEE #9876')).toBe(k);
  });

  it('is case and whitespace insensitive', () => {
    expect(normalizeMerchantKey('  Uber   Eats ')).toBe(normalizeMerchantKey('UBER EATS'));
  });

  it('strips trailing store numbers and dates', () => {
    expect(normalizeMerchantKey('TARGET 00023415 08/29')).toBe(normalizeMerchantKey('TARGET'));
  });

  it('returns a stable key for an unreadable descriptor', () => {
    expect(normalizeMerchantKey('  ')).toBe('');
  });
});

describe('local classification resolves confirmed merchants without the model (R4)', () => {
  it('returns high confidence for a user-confirmed merchant', () => {
    const r = classifyLocally(profile({ userConfirmedCategoryId: 'groceries' }));
    expect(r?.categoryId).toBe('groceries');
    expect(r?.confidence).toBe(1);
    expect(r?.source).toBe('rule');
  });

  it('returns the dominant category when history is overwhelming', () => {
    const r = classifyLocally(profile({ categoryDistribution: { groceries: 95, home: 5 } }));
    expect(r?.categoryId).toBe('groceries');
    expect(r?.confidence).toBeGreaterThan(0.8);
  });

  it('DEFERS on a genuinely mixed-use merchant — this is the case the model exists for', () => {
    expect(classifyLocally(profile({ categoryDistribution: { groceries: 40, home: 35, clothing: 25 } }))).toBeNull();
  });

  it('defers on an unknown merchant', () => {
    expect(classifyLocally(undefined)).toBeNull();
  });

  it('defers when history is too thin to trust', () => {
    expect(classifyLocally(profile({ categoryDistribution: { groceries: 1 }, transactionCount: 1 }))).toBeNull();
  });

  it('a user confirmation overrides even a contradictory distribution (FR-016)', () => {
    const r = classifyLocally(
      profile({ categoryDistribution: { home: 99, groceries: 1 }, userConfirmedCategoryId: 'groceries' }),
    );
    expect(r?.categoryId).toBe('groceries');
  });
});

describe('profile updating', () => {
  it('records a new observation', () => {
    const p = updateProfile(profile({ categoryDistribution: { groceries: 1 }, transactionCount: 1 }), 'dining');
    expect(p.categoryDistribution['dining']).toBe(1);
    expect(p.transactionCount).toBe(2);
  });

  it('creates a profile for an unseen merchant', () => {
    const p = updateProfile(undefined, 'dining', 'new-merchant');
    expect(p.merchantKey).toBe('new-merchant');
    expect(p.transactionCount).toBe(1);
  });
});
