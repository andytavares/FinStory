import { describe, it, expect } from 'vitest';
import { humanizeCategoryIds } from '@shared/category-names';

const names = new Map([
  ['cat_7b15be13', 'Supplements'],
  ['fitness', 'Fitness'],
  ['cat_fdd79b78', 'Medical & Doctor'],
]);

describe('humanizeCategoryIds keeps identifiers off the screen', () => {
  it('replaces a quoted id with its name, quotes and all', () => {
    expect(humanizeCategoryIds("50% for 'cat_7b15be13' and 50% for 'fitness'", names)).toBe(
      '50% for Supplements and 50% for Fitness',
    );
  });

  it('replaces a bare id', () => {
    expect(humanizeCategoryIds('favours cat_fdd79b78 here', names)).toBe(
      'favours Medical & Doctor here',
    );
  });

  it('replaces a double-quoted id', () => {
    expect(humanizeCategoryIds('picked "cat_7b15be13"', names)).toBe('picked Supplements');
  });

  it('leaves an id embedded in a longer word alone', () => {
    expect(humanizeCategoryIds('fitnessing', names)).toBe('fitnessing');
    expect(humanizeCategoryIds('cat_7b15be13x', names)).toBe('cat_7b15be13x');
  });

  it('leaves ordinary prose untouched', () => {
    expect(humanizeCategoryIds('No prior purchases at this merchant.', names)).toBe(
      'No prior purchases at this merchant.',
    );
  });

  it('handles an empty string and an empty map', () => {
    expect(humanizeCategoryIds('', names)).toBe('');
    expect(humanizeCategoryIds('cat_7b15be13', new Map())).toBe('cat_7b15be13');
  });

  it('substitutes the longest id first so a prefix cannot win', () => {
    const overlapping = new Map([
      ['food', 'Food'],
      ['food_delivery', 'Food Delivery'],
    ]);
    expect(humanizeCategoryIds('food_delivery and food', overlapping)).toBe(
      'Food Delivery and Food',
    );
  });

  it('does nothing when the id and the name are the same', () => {
    expect(humanizeCategoryIds('fitness', new Map([['fitness', 'fitness']]))).toBe('fitness');
  });

  it('replaces every occurrence', () => {
    expect(humanizeCategoryIds('fitness then fitness', names)).toBe('Fitness then Fitness');
  });
});
