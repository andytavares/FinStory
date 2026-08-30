import { describe, it, expect } from 'vitest';
import { createCategory, mergeCategories, setHidden, assignableCategories } from '@main/categories/manage';
import type { Category } from '@main/categories/manage';

const base: Category[] = [
  { id: 'food', name: 'Food', parentId: null, isSystem: true, isHidden: false, mergedIntoId: null },
  { id: 'dining', name: 'Dining', parentId: 'food', isSystem: true, isHidden: false, mergedIntoId: null },
  { id: 'groceries', name: 'Groceries', parentId: 'food', isSystem: true, isHidden: false, mergedIntoId: null },
];

describe('taxonomy nesting is capped at one level (FR-080)', () => {
  it('allows a top-level category', () => {
    const r = createCategory(base, { id: 'travel', name: 'Travel', parentId: null });
    expect(r.find((c) => c.id === 'travel')).toBeDefined();
  });

  it('allows one level of subcategory', () => {
    const r = createCategory(base, { id: 'takeout', name: 'Takeout', parentId: 'food' });
    expect(r.find((c) => c.id === 'takeout')?.parentId).toBe('food');
  });

  it('REJECTS a second level of nesting', () => {
    expect(() => createCategory(base, { id: 'pizza', name: 'Pizza', parentId: 'dining' })).toThrow(
      /nesting/i,
    );
  });

  it('rejects a parent that does not exist', () => {
    expect(() => createCategory(base, { id: 'x', name: 'X', parentId: 'nope' })).toThrow(/parent/i);
  });
});

describe('merge preserves references (FR-081, FR-083)', () => {
  it('records where a merged category went so old references still resolve', () => {
    const r = mergeCategories(base, 'dining', 'groceries');
    expect(r.categories.find((c) => c.id === 'dining')?.mergedIntoId).toBe('groceries');
  });

  it('reports the target so transactions can be reassigned', () => {
    expect(mergeCategories(base, 'dining', 'groceries').reassignTo).toBe('groceries');
  });

  it('refuses to merge a category into itself', () => {
    expect(() => mergeCategories(base, 'dining', 'dining')).toThrow(/itself/i);
  });
});

describe('hide is not delete (FR-082)', () => {
  it('removes a hidden category from assignable choices', () => {
    const hidden = setHidden(base, 'dining', true);
    expect(assignableCategories(hidden).map((c) => c.id)).not.toContain('dining');
  });

  it('retains the hidden category so history still resolves', () => {
    const hidden = setHidden(base, 'dining', true);
    expect(hidden.find((c) => c.id === 'dining')).toBeDefined();
  });

  it('excludes merged categories from assignable choices too', () => {
    const merged = mergeCategories(base, 'dining', 'groceries').categories;
    expect(assignableCategories(merged).map((c) => c.id)).not.toContain('dining');
  });
});
