export interface Groupable {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly parentId: string | null;
  readonly parentName: string | null;
  readonly totalMinor: number;
}

/** Roll rows up to their parent, keeping the grand total intact. Largest spend first. */
export function rollUp(rows: readonly Groupable[]): Groupable[] {
  const groups = new Map<string, Groupable>();
  for (const row of rows) {
    const id = row.parentId ?? row.categoryId;
    const name = row.parentId ? (row.parentName ?? row.parentId) : row.categoryName;
    const existing = groups.get(id);
    groups.set(id, {
      categoryId: id,
      categoryName: name,
      parentId: null,
      parentName: null,
      totalMinor: (existing?.totalMinor ?? 0) + row.totalMinor,
    });
  }
  return [...groups.values()].sort((a, b) => a.totalMinor - b.totalMinor);
}
