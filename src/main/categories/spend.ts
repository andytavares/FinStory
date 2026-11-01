/** What each category spent in a period, alone and with its subcategories. */
export function categorySpend(
  rows: ReadonlyArray<{ categoryId: string; totalMinor: number }>,
  parents: ReadonlyMap<string, string | null>,
): { direct: Map<string, number>; rolledUp: Map<string, number> } {
  const direct = new Map<string, number>();
  const rolledUp = new Map<string, number>();
  for (const { categoryId, totalMinor } of rows) {
    const spent = 0 - totalMinor;
    direct.set(categoryId, spent);
    rolledUp.set(categoryId, (rolledUp.get(categoryId) ?? 0) + spent);
    const parentId = parents.get(categoryId);
    if (parentId) rolledUp.set(parentId, (rolledUp.get(parentId) ?? 0) + spent);
  }
  return { direct, rolledUp };
}
