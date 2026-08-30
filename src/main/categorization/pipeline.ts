import { classifyLocally, normalizeMerchantKey, updateProfile } from './local';
import { classifyByHeuristic } from './heuristics';
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

    // local_only mode: no model stage. Fall back to merchant heuristics, which
    // is what makes a fresh import usable — with no history and no model, every
    // transaction would otherwise be Uncategorizable (FR-061).
    if (this.options.localOnly) {
      return this.#withoutModel(input, merchantKey, profile);
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
      return this.#withoutModel(input, merchantKey, profile);
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

  /**
   * Best answer available with no model: prior history, then merchant
   * heuristics, then honestly Uncategorizable.
   */
  #withoutModel(
    input: CategorizationInput,
    merchantKey: string,
    profile: MerchantProfile | undefined,
  ): CategorizationResult {
    const fromHistory = profile ? dominantCategory(profile) : null;
    if (fromHistory) {
      this.#record(merchantKey, fromHistory);
      return {
        transactionId: input.transactionId,
        categoryId: fromHistory,
        confidence: 0.5,
        source: 'local_history',
        needsReview: true,
        reasoning: 'Based on how you have categorized this merchant before',
      };
    }

    const heuristic = classifyByHeuristic(input.descriptor);
    if (heuristic) {
      this.#record(merchantKey, heuristic.categoryId);
      return {
        transactionId: input.transactionId,
        categoryId: heuristic.categoryId,
        confidence: heuristic.confidence,
        source: 'local_history',
        needsReview: heuristic.confidence < this.options.confidenceThreshold,
        reasoning: heuristic.reasoning,
      };
    }

    this.#record(merchantKey, UNCATEGORIZABLE);
    return {
      transactionId: input.transactionId,
      categoryId: UNCATEGORIZABLE,
      confidence: 0,
      source: 'local_history',
      needsReview: true,
      reasoning: 'No model configured and no history for this merchant yet',
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
