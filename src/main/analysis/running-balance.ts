/** A credit or loan balance is what is owed, so spending raises it. */
export const OWED_TYPES = new Set(['credit', 'loan']);

/**
 * The balance after each transaction, working back from the bank's current balance.
 * `newestFirst` must hold every transaction in the account, not a filtered subset.
 */
// shortcut: assumes the bank balance already includes every stored row, pending ones too; upgrade if balances drift by pending amounts.
export function runningBalances(
  newestFirst: readonly { id: string; amountMinor: number }[],
  account: { currentBalanceMinor: number; type: string },
): Map<string, number> {
  const sign = OWED_TYPES.has(account.type) ? -1 : 1;
  const after = new Map<string, number>();
  let balance = account.currentBalanceMinor;
  for (const row of newestFirst) {
    after.set(row.id, balance);
    balance -= sign * row.amountMinor;
  }
  return after;
}
