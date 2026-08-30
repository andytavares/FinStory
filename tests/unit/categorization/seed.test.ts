import { describe, it, expect } from 'vitest';
import { defaultCategories, taxonomyPromptList } from '@main/db/seed-categories';

describe('default taxonomy (FR-078)', () => {
  const categories = defaultCategories();

  it('ships a usable taxonomy requiring no setup', () => {
    expect(categories.length).toBeGreaterThan(20);
  });

  it('is nested at most one level deep (FR-080)', () => {
    const parents = new Set(categories.filter((c) => c.parentId === null).map((c) => c.id));
    for (const c of categories) {
      if (c.parentId !== null) expect(parents.has(c.parentId)).toBe(true);
    }
  });

  it('reserves Uncategorizable for genuinely unknowable cases', () => {
    expect(categories.find((c) => c.id === 'uncategorizable')).toBeDefined();
  });

  it('marks every seeded category as system-owned', () => {
    expect(categories.every((c) => c.isSystem)).toBe(true);
  });

  it('renders a prompt list excluding hidden and merged categories', () => {
    const list = taxonomyPromptList([
      ...categories,
      { id: 'gone', name: 'Gone', parentId: null, isSystem: false, isHidden: true, mergedIntoId: null },
    ]);
    expect(list).toContain('groceries: Groceries');
    expect(list).not.toContain('gone');
  });
});
