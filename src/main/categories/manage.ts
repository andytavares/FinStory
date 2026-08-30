/**
 * Category taxonomy management.
 *
 * Categories are referenced everywhere by stable `id`, never by name. That is
 * what makes a rename display-only and keeps month-over-month comparison
 * coherent across taxonomy edits (FR-083).
 */

export interface Category {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly isSystem: boolean;
  readonly isHidden: boolean;
  readonly mergedIntoId: string | null;
}

export interface NewCategory {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}

export function createCategory(existing: readonly Category[], next: NewCategory): Category[] {
  if (next.parentId !== null) {
    const parent = existing.find((c) => c.id === next.parentId);
    if (!parent) {
      throw new TypeError(`Unknown parent category: ${next.parentId}`);
    }
    // One level only. A category that already has a parent cannot be one (FR-080).
    if (parent.parentId !== null) {
      throw new RangeError(
        'Category nesting is limited to one level; cannot nest under a subcategory',
      );
    }
  }
  return [
    ...existing,
    { ...next, isSystem: false, isHidden: false, mergedIntoId: null },
  ];
}

export function renameCategory(
  existing: readonly Category[],
  id: string,
  name: string,
): Category[] {
  // Display-only: ids are stable, so nothing downstream is affected.
  return existing.map((c) => (c.id === id ? { ...c, name } : c));
}

export interface MergeResult {
  readonly categories: Category[];
  /** Transactions assigned to the source must be reassigned here (FR-081). */
  readonly reassignTo: string;
}

export function mergeCategories(
  existing: readonly Category[],
  sourceId: string,
  targetId: string,
): MergeResult {
  if (sourceId === targetId) {
    throw new RangeError('Cannot merge a category into itself');
  }
  if (!existing.some((c) => c.id === targetId)) {
    throw new TypeError(`Unknown merge target: ${targetId}`);
  }
  return {
    // The source row is retained, not deleted, so historical references resolve.
    categories: existing.map((c) => (c.id === sourceId ? { ...c, mergedIntoId: targetId } : c)),
    reassignTo: targetId,
  };
}

export function setHidden(
  existing: readonly Category[],
  id: string,
  hidden: boolean,
): Category[] {
  return existing.map((c) => (c.id === id ? { ...c, isHidden: hidden } : c));
}

/**
 * Categories offered for new assignments.
 *
 * Hidden and merged categories are excluded here but remain in historical
 * reporting, which keeps prior periods reconcilable (FR-082, SC-004).
 */
export function assignableCategories(existing: readonly Category[]): Category[] {
  return existing.filter((c) => !c.isHidden && c.mergedIntoId === null);
}
