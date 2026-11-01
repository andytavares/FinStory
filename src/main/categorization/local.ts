/**
 * Stage one: local classification from the user's own merchant history.
 *
 * This stage exists for three reasons at once (research.md R4): it is free, it
 * is instant, and nothing leaves the machine. Most transactions are repeat
 * visits to merchants the user has already been categorized at, so most
 * transactions never reach the model.
 *
 * Returning null is the contract for "defer to the model" — it must defer on
 * genuinely ambiguous merchants rather than guessing, because a confident wrong
 * category is worse than one flagged for review.
 */

export interface MerchantProfile {
  readonly merchantKey: string;
  /** categoryId -> observation count. */
  readonly categoryDistribution: Readonly<Record<string, number>>;
  /** Set by a user correction; makes FR-016 deterministic rather than probabilistic. */
  readonly userConfirmedCategoryId: string | null;
  readonly transactionCount: number;
}

export interface LocalClassification {
  readonly categoryId: string;
  readonly confidence: number;
  readonly source: 'local_history' | 'rule';
  readonly reasoning: string;
}

/** Dominance required to decide locally without consulting the model. */
const DOMINANCE_THRESHOLD = 0.8;
/** Observations required before a distribution means anything. */
const MIN_OBSERVATIONS = 3;

const NOISE_PATTERNS: readonly RegExp[] = [
  /^(sq|tst|sp|py|pp|ach|pos|dbt|crd)\s*\*+/i, // processor prefixes
  /#\s*\d+/g, // store numbers
  /\b\d{2}\/\d{2}(\/\d{2,4})?\b/g, // embedded dates
  /\b\d{4,}\b/g, // long digit runs (store/terminal ids)
  /[^a-z0-9\s]/gi, // punctuation
];

/**
 * Normalize a raw descriptor to a stable merchant key.
 *
 * Descriptors carry store numbers, terminal ids, and dates that differ per
 * visit. Without normalization the same merchant looks like dozens of distinct
 * ones and no history ever accumulates.
 */
export function normalizeMerchantKey(descriptor: string): string {
  let key = descriptor.toLowerCase();
  for (const pattern of NOISE_PATTERNS) {
    key = key.replace(pattern, ' ');
  }
  return key.trim().replace(/\s+/g, ' ');
}

export function classifyLocally(profile: MerchantProfile | undefined): LocalClassification | null {
  if (!profile) return null;

  // A deliberate past correction always wins, whatever the distribution says.
  if (profile.userConfirmedCategoryId) {
    return {
      categoryId: profile.userConfirmedCategoryId,
      confidence: 1,
      source: 'rule',
      reasoning: 'Previously confirmed by you for this merchant',
    };
  }

  const entries = Object.entries(profile.categoryDistribution);
  if (entries.length === 0) return null;

  const total = entries.reduce((acc, [, n]) => acc + n, 0);
  if (total < MIN_OBSERVATIONS) return null;

  const [topCategory, topCount] = entries.reduce((best, e) => (e[1] > best[1] ? e : best));
  const share = topCount / total;
  if (share < DOMINANCE_THRESHOLD) return null;

  return {
    categoryId: topCategory,
    confidence: Number(share.toFixed(4)),
    source: 'local_history',
    reasoning: `${Math.round(share * 100)}% of your ${total} prior purchases here`,
  };
}

/** Fold a decided category back into the merchant's history. */
export function updateProfile(
  existing: MerchantProfile | undefined,
  categoryId: string,
  merchantKey?: string,
): MerchantProfile {
  const base: MerchantProfile = existing ?? {
    merchantKey: merchantKey ?? '',
    categoryDistribution: {},
    userConfirmedCategoryId: null,
    transactionCount: 0,
  };
  return {
    ...base,
    categoryDistribution: {
      ...base.categoryDistribution,
      [categoryId]: (base.categoryDistribution[categoryId] ?? 0) + 1,
    },
    transactionCount: base.transactionCount + 1,
  };
}
