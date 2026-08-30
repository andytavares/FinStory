import { resolveMerchantName, type NameableTransaction } from '@shared/merchant-name';

/**
 * The name to show for a transaction.
 *
 * The main process already resolves overrides into `merchantName`, so aliases
 * are not repeated here. This exists so no view reaches for `.description`
 * directly — doing so is how the review queue ended up showing raw bank
 * descriptors after the user had renamed the merchant.
 */
export function transactionName(transaction: NameableTransaction): string {
  return resolveMerchantName(transaction);
}
