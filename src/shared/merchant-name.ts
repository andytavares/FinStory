/**
 * What a transaction is called on screen.
 *
 * There is exactly one rule and every surface uses it, because three surfaces
 * with three slightly different orderings is how a rename ends up visible in
 * the register and invisible in the review queue.
 *
 * Precedence, most specific first:
 *  1. A name the user typed on this transaction.
 *  2. A name the user gave this merchant (a rename applied merchant-wide).
 *  3. The cleaned merchant name the bank sent.
 *  4. The raw descriptor, which is always present.
 *
 * The user's own words always win. Nothing here ever falls back to the
 * normalized merchant key: that is an internal identifier, not a name.
 */
export interface NameableTransaction {
  readonly description: string;
  readonly merchantName?: string | null;
  readonly userMerchantName?: string | null;
  readonly merchantKey?: string | null;
}

export function resolveMerchantName(
  transaction: NameableTransaction,
  aliases: ReadonlyMap<string, string> = new Map(),
): string {
  const own = clean(transaction.userMerchantName);
  if (own) return own;

  const alias = transaction.merchantKey ? clean(aliases.get(transaction.merchantKey)) : null;
  if (alias) return alias;

  return clean(transaction.merchantName) ?? transaction.description;
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
