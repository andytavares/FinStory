const NOT_EVERYDAY_SUBTYPES = new Set([
  'savings',
  'cd',
  'money market',
  'hsa',
  'ira',
  '401k',
  'brokerage',
  'roth',
  '529',
]);

const NOT_EVERYDAY_TYPES = new Set(['investment', 'brokerage', 'loan']);

/**
 * Whether an account holds day-to-day spending money.
 *
 * Credit cards are day-to-day money. Most people put most of their spending on
 * one, so excluding them — which an earlier `type === 'depository'` check did —
 * leaves the dashboard reading zero. The exclusion is about savings and
 * investments: balances the user is deliberately not spending from.
 */
export function isEverydayAccount(type: string, subtype: string | null): boolean {
  if (NOT_EVERYDAY_TYPES.has(type.toLowerCase())) return false;
  return subtype === null || !NOT_EVERYDAY_SUBTYPES.has(subtype.toLowerCase());
}
