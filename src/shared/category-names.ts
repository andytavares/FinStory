/**
 * Replace category identifiers with the names the user reads.
 *
 * The taxonomy is sent to the model as `id: Name` pairs, and the model quotes
 * those ids back in its reasoning — so "cat_7b15be13" ends up on screen. An
 * identifier is not a name and must never be shown.
 *
 * Longest ids are substituted first so one id cannot be a prefix of another.
 */
export function humanizeCategoryIds(
  text: string,
  names: ReadonlyMap<string, string>,
): string {
  if (text.length === 0 || names.size === 0) return text;
  const ids = [...names.keys()].sort((a, b) => b.length - a.length);
  let out = text;
  for (const id of ids) {
    const name = names.get(id);
    if (!name || name === id) continue;
    // Quoted first, so the quotes go with the identifier rather than being left
    // wrapped around a name.
    out = out.split(`'${id}'`).join(name);
    out = out.split(`"${id}"`).join(name);
    out = replaceWholeWord(out, id, name);
  }
  return out;
}

function replaceWholeWord(text: string, id: string, name: string): string {
  const boundary = /[A-Za-z0-9_-]/;
  let out = '';
  let from = 0;
  for (;;) {
    const at = text.indexOf(id, from);
    if (at === -1) return out + text.slice(from);
    const before = at === 0 ? '' : text[at - 1]!;
    const after = text[at + id.length] ?? '';
    const isWhole = !boundary.test(before) && !boundary.test(after);
    out += text.slice(from, at) + (isWhole ? name : id);
    from = at + id.length;
  }
}
