/**
 * Labeled corpus for SC-002 (94% hands-off categorization accuracy).
 *
 * Deliberately mixed: unambiguous repeat merchants that the local stage should
 * resolve for free, genuinely mixed-use merchants that must reach the model,
 * and generic processor descriptors that should end in the review queue rather
 * than being confidently mis-assigned.
 */
export interface LabeledTransaction {
  readonly descriptor: string;
  readonly amountMinor: number;
  readonly occurredAt: string;
  readonly expectedCategoryId: string;
  readonly kind: 'unambiguous' | 'mixed_use' | 'generic';
}

const unambiguous: ReadonlyArray<[string, number, string]> = [
  ['UBER EATS', -3421, 'dining'],
  ['DOORDASH', -2890, 'dining'],
  ['GRUBHUB', -1955, 'dining'],
  ['STARBUCKS #1123', -637, 'dining'],
  ['SHELL OIL 5567', -5210, 'transport'],
  ['UBER TRIP', -1840, 'transport'],
  ['LYFT RIDE', -1220, 'transport'],
  ['NETFLIX.COM', -1599, 'subscriptions'],
  ['SPOTIFY USA', -1199, 'subscriptions'],
  ['APPLE.COM/BILL ICLOUD', -299, 'subscriptions'],
  ['TRADER JOES #445', -8734, 'groceries'],
  ['WHOLE FOODS MKT', -12045, 'groceries'],
  ['SAFEWAY #2201', -6612, 'groceries'],
  ['CVS PHARMACY', -1877, 'health'],
  ['WALGREENS #778', -2234, 'health'],
  ['CONED BILLING', -9800, 'utilities'],
  ['VERIZON WIRELESS', -8500, 'utilities'],
  ['AMC THEATRES', -2600, 'entertainment'],
  ['STEAM GAMES', -5999, 'entertainment'],
  ['DELTA AIR LINES', -34500, 'travel'],
];

const mixedUse: ReadonlyArray<[string, number, string]> = [
  ['TARGET 00023415', -4782, 'groceries'],
  ['TARGET 00023415', -11250, 'home'],
  ['AMAZON.COM*RT4D9', -1247, 'shopping'],
  ['AMAZON.COM*KK21M', -3175, 'home'],
  ['WALMART SUPERCENTER', -7320, 'groceries'],
  ['COSTCO WHSE #1102', -18900, 'groceries'],
];

const generic: ReadonlyArray<[string, number, string]> = [
  ['SQ *MERCHANT', -1500, 'uncategorizable'],
  ['PAYPAL *TRANSFER', -4000, 'uncategorizable'],
  ['ATM WITHDRAWAL', -20000, 'uncategorizable'],
];

function build(): LabeledTransaction[] {
  const out: LabeledTransaction[] = [];
  const push = (
    rows: ReadonlyArray<[string, number, string]>,
    kind: LabeledTransaction['kind'],
    repeats: number,
  ): void => {
    for (let r = 0; r < repeats; r += 1) {
      rows.forEach(([descriptor, amountMinor, expectedCategoryId], i) => {
        out.push({
          descriptor,
          amountMinor,
          occurredAt: new Date(Date.UTC(2026, 0, 1 + r * 7, 12 + (i % 10))).toISOString(),
          expectedCategoryId,
          kind,
        });
      });
    }
  };
  // Repeat counts approximate real usage: mostly familiar merchants.
  push(unambiguous, 'unambiguous', 6);
  push(mixedUse, 'mixed_use', 3);
  push(generic, 'generic', 2);
  return out;
}

export const CATEGORIZATION_CORPUS: readonly LabeledTransaction[] = build();
