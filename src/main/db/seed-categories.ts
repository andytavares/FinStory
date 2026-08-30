import type { Category } from '@main/categories/manage';

/**
 * Curated default taxonomy (FR-078).
 *
 * A closed, curated set is what makes the 94% accuracy target achievable: the
 * categorizer is prompted against a known list rather than an open vocabulary,
 * and prompt caching on that stable taxonomy is what keeps per-transaction cost
 * near zero (research.md R4, R13). Users extend it; they do not have to build it.
 */

const TOP_LEVEL: ReadonlyArray<[string, string]> = [
  ['food', 'Food'],
  ['housing', 'Housing'],
  ['transport', 'Transport'],
  ['shopping', 'Shopping'],
  ['health', 'Health'],
  ['entertainment', 'Entertainment'],
  ['subscriptions', 'Subscriptions'],
  ['utilities', 'Utilities'],
  ['travel', 'Travel'],
  ['financial', 'Financial'],
  ['income', 'Income'],
  ['uncategorizable', 'Uncategorizable'],
];

const SUBCATEGORIES: ReadonlyArray<[string, string, string]> = [
  ['groceries', 'Groceries', 'food'],
  ['dining', 'Dining & Takeout', 'food'],
  ['coffee', 'Coffee', 'food'],
  ['rent', 'Rent & Mortgage', 'housing'],
  ['home', 'Home & Garden', 'housing'],
  ['fuel', 'Fuel', 'transport'],
  ['rideshare', 'Rideshare & Taxi', 'transport'],
  ['transit', 'Public Transit', 'transport'],
  ['clothing', 'Clothing', 'shopping'],
  ['electronics', 'Electronics', 'shopping'],
  ['pharmacy', 'Pharmacy', 'health'],
  ['fitness', 'Fitness', 'health'],
  ['streaming', 'Streaming', 'subscriptions'],
  ['software', 'Software', 'subscriptions'],
];

/**
 * `Uncategorizable` is reserved and deliberate: a cash withdrawal's true
 * category is unknowable, and Constitution IX requires representing that
 * honestly rather than guessing.
 */
export function defaultCategories(): Category[] {
  return [
    ...TOP_LEVEL.map(([id, name]) => ({
      id,
      name,
      parentId: null,
      isSystem: true,
      isHidden: false,
      mergedIntoId: null,
    })),
    ...SUBCATEGORIES.map(([id, name, parentId]) => ({
      id,
      name,
      parentId,
      isSystem: true,
      isHidden: false,
      mergedIntoId: null,
    })),
  ];
}

/** Flat id list for the model prompt; cached as a stable prefix (research.md R4). */
export function taxonomyPromptList(categories: readonly Category[]): string {
  return categories
    .filter((c) => c.mergedIntoId === null && !c.isHidden)
    .map((c) => `${c.id}: ${c.name}${c.parentId ? ` (under ${c.parentId})` : ''}`)
    .join('\n');
}
