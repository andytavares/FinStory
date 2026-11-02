import { randomUUID } from 'node:crypto';
import type * as t from '@main/db/schema';

type CategoryRecord = typeof t.categories.$inferSelect;

/** `categoryId` value in a category map that means "create this Quicken category in Money". */
export const NEW_CATEGORY = 'new';

export interface QuickenCategoryPlan {
  /** Rows to insert, parents before children. */
  readonly create: CategoryRecord[];
  /** Quicken path, e.g. "Pets:Vet", to the Money category id it lands in. */
  readonly idFor: Map<string, string>;
}

const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Money nests one level, so "Auto:Fuel:Premium" becomes "Auto" › "Fuel › Premium".
 * A one-part path reuses any live category with that name; otherwise a match must sit under the same parent.
 */
export function planQuickenCategories(
  paths: readonly string[],
  existing: readonly CategoryRecord[],
): QuickenCategoryPlan {
  const live: CategoryRecord[] = existing.filter((c) => c.mergedIntoId === null);
  const create: CategoryRecord[] = [];
  const findOrCreate = (name: string, parentId: string | null, anyLevel: boolean): string => {
    const hit = live.find((c) => sameName(c.name, name) && (anyLevel || c.parentId === parentId));
    if (hit) return hit.id;
    const row = {
      id: `cat_${randomUUID().slice(0, 8)}`,
      name: name.trim(),
      parentId,
      isSystem: false,
      isHidden: false,
      mergedIntoId: null,
    };
    live.push(row);
    create.push(row);
    return row.id;
  };
  const idFor = new Map<string, string>();
  for (const path of paths) {
    const [top = path, ...rest] = path.split(':');
    const parentId = findOrCreate(top, null, rest.length === 0);
    idFor.set(path, rest.length === 0 ? parentId : findOrCreate(rest.join(' › '), parentId, false));
  }
  return { create, idFor };
}
