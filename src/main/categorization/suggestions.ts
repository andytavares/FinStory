/** Category ids to offer for a flagged transaction: the model's guess, then the merchant's usual others. */
export function suggestCategoryIds(
  guessCategoryId: string,
  categoryDistributionJson: string | undefined,
  count = 3,
): string[] {
  const distribution = JSON.parse(categoryDistributionJson ?? '{}') as Record<string, number>;
  const usual = Object.entries(distribution)
    .filter(([categoryId]) => categoryId !== guessCategoryId)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([categoryId]) => categoryId);
  return [guessCategoryId, ...usual].slice(0, count);
}
