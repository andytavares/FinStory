// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { assignableCategories } from '@renderer/components/TransactionEditor';

const cat = (o: Partial<Parameters<typeof assignableCategories>[0][number]>) => ({
  id: 'x',
  name: 'X',
  parentId: null,
  isHidden: false,
  mergedIntoId: null,
  ...o,
});

describe('category option labels', () => {
  it('labels a subcategory with its parent', () => {
    const options = assignableCategories([
      cat({ id: 'food', name: 'Food' }),
      cat({ id: 'dining', name: 'Dining & Takeout', parentId: 'food' }),
    ]);
    expect(options.find((o) => o.id === 'dining')?.label).toBe('Food › Dining & Takeout');
  });

  it('still names the parent when the parent is HIDDEN', () => {
    // The bug: a hidden parent was filtered out before the name lookup, so its
    // children rendered as a bare "› Coffee".
    const options = assignableCategories([
      cat({ id: 'food', name: 'Food', isHidden: true }),
      cat({ id: 'coffee', name: 'Coffee', parentId: 'food' }),
    ]);
    expect(options.find((o) => o.id === 'coffee')?.label).toBe('Food › Coffee');
    expect(options.some((o) => o.id === 'food')).toBe(false);
  });

  it('still names the parent when the parent was merged away', () => {
    const options = assignableCategories([
      cat({ id: 'food', name: 'Food', mergedIntoId: 'living' }),
      cat({ id: 'coffee', name: 'Coffee', parentId: 'food' }),
    ]);
    expect(options.find((o) => o.id === 'coffee')?.label).toBe('Food › Coffee');
  });

  it('never emits a label starting with the separator', () => {
    const options = assignableCategories([
      cat({ id: 'orphan', name: 'Coffee', parentId: 'gone' }),
    ]);
    expect(options[0]?.label).toBe('Coffee');
    expect(options.every((o) => !o.label.startsWith('›'))).toBe(true);
  });

  it('excludes hidden and merged categories from the choices themselves', () => {
    const options = assignableCategories([
      cat({ id: 'a', name: 'A' }),
      cat({ id: 'b', name: 'B', isHidden: true }),
      cat({ id: 'c', name: 'C', mergedIntoId: 'a' }),
    ]);
    expect(options.map((o) => o.id)).toEqual(['a']);
  });

  it('sorts alphabetically so the list is scannable', () => {
    const options = assignableCategories([
      cat({ id: 'z', name: 'Zebra' }),
      cat({ id: 'a', name: 'Apple' }),
    ]);
    expect(options.map((o) => o.label)).toEqual(['Apple', 'Zebra']);
  });
});
