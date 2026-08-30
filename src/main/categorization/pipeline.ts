import { classifyLocally, normalizeMerchantKey, updateProfile } from './local';
import type { MerchantProfile } from './local';

/**
 * Two-stage categorization: local history first, hosted model only for what it
 * cannot resolve (research.md R4).
 *
 * The ordering is the privacy mechanism, not just an optimization. A merchant
 * the user has already confirmed never reaches the network at all.
 */

export interface ModelInput {
  readonly merchantKey: string;
  readonly descriptor: string;
  readonly amountMinor: number;
  readonly occurredAt: Date;
  /** The user's own prior distribution for THIS merchant only. */
  readonly priorDistribution: Readonly<Record<string, number>>;
}

export interface ModelResult {
  readonly categoryId: string;
  readonly confidence: number;
  readonly reasoning: string;
}

export interface ModelClassifier {
  classify(input: ModelInput): Promise<ModelResult>;
}

export interface CategorizationInput {
  readonly transactionId: string;
  readonly descriptor: string;
  readonly amountMinor: number;
  readonly occurredAt: Date;
}

export interface CategorizationResult {
  readonly transactionId: string;
  readonly categoryId: string;
  readonly confidence: number;
  readonly source: 'local_history' | 'model' | 'user';
  readonly needsReview: boolean;
  readonly reasoning: string;
}

export interface PipelineOptions {
  readonly confidenceThreshold: number;
  /** When true, the model stage is skipped entirely (FR-061, local_only mode). */
  readonly localOnly?: boolean;
}

const UNCATEGORIZABLE = 'uncategorizable';

export class CategorizationPipeline {
  readonly #profiles = new Map<string, MerchantProfile>();

  constructor(
    private readonly model: ModelClassifier,
    private readonly options: PipelineOptions,
  ) {}

  /** Seed learned history, e.g. from the database on startup. */
  loadProfile(profile: MerchantProfile): void {
    this.#profiles.set(profile.merchantKey, profile);
  }

  getProfile(merchantKey: string): MerchantProfile | undefined {
    return this.#profiles.get(merchantKey);
  }

  /** Record a user correction so future comparable transactions follow it (FR-016). */
  confirmCategory(merchantKey: string, categoryId: string): void {
    const existing = this.#profiles.get(merchantKey);
    this.#profiles.set(merchantKey, {
      ...(existing ?? {
        merchantKey,
        categoryDistribution: {},
        transactionCount: 0,
      }),
      userConfirmedCategoryId: categoryId,
    } as MerchantProfile);
  }

  async categorize(input: CategorizationInput): Promise<CategorizationResult> {
    const merchantKey = normalizeMerchantKey(input.descriptor);
    const profile = this.#profiles.get(merchantKey);

    // Stage one — free, instant, nothing leaves the machine.
    const local = classifyLocally(profile);
    if (local) {
      this.#record(merchantKey, local.categoryId);
      return {
        transactionId: input.transactionId,
        categoryId: local.categoryId,
        confidence: local.confidence,
        source: 'local_history',
        needsReview: local.confidence < this.options.confidenceThreshold,
        reasoning: local.reasoning,
      };
    }

    // local_only mode: the local stage is the whole system. Lower accuracy and
    // a larger review queue are the accepted trade (FR-061).
    if (this.options.localOnly) {
      const guess = profile ? dominantCategory(profile) : null;
      const categoryId = guess ?? UNCATEGORIZABLE;
      this.#record(merchantKey, categoryId);
      return {
        transactionId: input.transactionId,
        categoryId,
        confidence: 0.3,
        source: 'local_history',
        needsReview: true,
        reasoning: 'Offline categorization mode; flagged for your review',
      };
    }

    // Stage two — the model. Only novel or ambiguous merchants get here.
    let result: ModelResult;
    try {
      result = await this.model.classify({
        merchantKey,
        descriptor: input.descriptor,
        amountMinor: input.amountMinor,
        occurredAt: input.occurredAt,
        priorDistribution: profile?.categoryDistribution ?? {},
      });
    } catch {
      // Categorization failure must never block ingestion: a missing
      // transaction is a correctness bug, a poorly categorized one is a
      // review-queue item (contracts/external-services.md).
      const fallback = profile ? dominantCategory(profile) : null;
      const categoryId = fallback ?? UNCATEGORIZABLE;
      this.#record(merchantKey, categoryId);
      return {
        transactionId: input.transactionId,
        categoryId,
        confidence: 0,
        source: 'local_history',
        needsReview: true,
        reasoning: 'Categorization unavailable; flagged for your review',
      };
    }

    this.#record(merchantKey, result.categoryId);
    return {
      transactionId: input.transactionId,
      categoryId: result.categoryId,
      confidence: result.confidence,
      source: 'model',
      needsReview: result.confidence < this.options.confidenceThreshold,
      reasoning: result.reasoning,
    };
  }

  #record(merchantKey: string, categoryId: string): void {
    this.#profiles.set(
      merchantKey,
      updateProfile(this.#profiles.get(merchantKey), categoryId, merchantKey),
    );
  }
}

function dominantCategory(profile: MerchantProfile): string | null {
  const entries = Object.entries(profile.categoryDistribution);
  if (entries.length === 0) return null;
  return entries.reduce((best, e) => (e[1] > best[1] ? e : best))[0];
}
