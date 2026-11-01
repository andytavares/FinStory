const CATEGORY_COLOR_COUNT = 8;

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

/** One of the eight category colour tokens, by list position or stable id. */
export function categoryColor(indexOrId: number | string): string {
  const raw = typeof indexOrId === 'number' ? indexOrId : hash(indexOrId);
  const slot = ((raw % CATEGORY_COLOR_COUNT) + CATEGORY_COLOR_COUNT) % CATEGORY_COLOR_COUNT;
  return `var(--color-cat-${slot + 1})`;
}
