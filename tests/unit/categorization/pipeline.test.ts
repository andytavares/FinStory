import { describe, it, expect } from 'vitest';
import { CategorizationPipeline } from '@main/categorization/pipeline';
import type { ModelClassifier } from '@main/categorization/pipeline';

const ok: ModelClassifier = {
  async classify() {
    return { categoryId: 'dining', confidence: 0.91, reasoning: 'evening food merchant' };
  },
};
const failing: ModelClassifier = {
  async classify() {
    throw new Error('API unavailable');
  },
};

const input = {
  transactionId: 'txn_1',
  descriptor: 'UBER EATS',
  amountMinor: -3421,
  occurredAt: new Date('2026-08-29T20:00:00Z'),
};

describe('pipeline routing', () => {
  it('uses the model for an unknown merchant', async () => {
    const p = new CategorizationPipeline(ok, { confidenceThreshold: 0.8 });
    const r = await p.categorize(input);
    expect(r.source).toBe('model');
    expect(r.categoryId).toBe('dining');
    expect(r.needsReview).toBe(false);
  });

  it('flags a below-threshold result for review (FR-013)', async () => {
    const lowConfidence: ModelClassifier = {
      async classify() {
        return { categoryId: 'dining', confidence: 0.5, reasoning: 'unsure' };
      },
    };
    const p = new CategorizationPipeline(lowConfidence, { confidenceThreshold: 0.8 });
    expect((await p.categorize(input)).needsReview).toBe(true);
  });

  it('learns, then resolves the same merchant locally', async () => {
    const p = new CategorizationPipeline(ok, { confidenceThreshold: 0.8 });
    for (let i = 0; i < 4; i += 1) {
      await p.categorize({ ...input, transactionId: `txn_${i}` });
    }
    expect((await p.categorize({ ...input, transactionId: 'txn_last' })).source).toBe(
      'local_history',
    );
  });

  it('honours a user confirmation over learned history (FR-016)', async () => {
    const p = new CategorizationPipeline(ok, { confidenceThreshold: 0.8 });
    p.confirmCategory('uber eats', 'groceries');
    const r = await p.categorize(input);
    expect(r.categoryId).toBe('groceries');
    expect(r.confidence).toBe(1);
  });
});

describe('pipeline never blocks ingestion', () => {
  it('degrades to review-queue when the model fails', async () => {
    const p = new CategorizationPipeline(failing, { confidenceThreshold: 0.8 });
    // UBER EATS matches a merchant heuristic, so the fallback is a usable guess
    // flagged for review — not a dump into Uncategorizable.
    const r = await p.categorize(input);
    expect(r.needsReview).toBe(true);
    expect(r.categoryId).toBe('dining');
  });

  it('falls through to uncategorizable only for a genuinely unknown merchant', async () => {
    const p = new CategorizationPipeline(failing, { confidenceThreshold: 0.8 });
    const r = await p.categorize({ ...input, descriptor: 'ZZQQ MERCHANT 8817' });
    expect(r.categoryId).toBe('uncategorizable');
    expect(r.confidence).toBe(0);
  });

  it('falls back to learned history when the model fails', async () => {
    const p = new CategorizationPipeline(ok, { confidenceThreshold: 0.8 });
    await p.categorize(input);
    const offline = new CategorizationPipeline(failing, { confidenceThreshold: 0.8 });
    const profile = p.getProfile('uber eats');
    if (profile) offline.loadProfile(profile);
    expect((await offline.categorize(input)).categoryId).toBe('dining');
  });
});

describe('local_only mode never calls the model (FR-061)', () => {
  it('skips the model entirely', async () => {
    let called = false;
    const spy: ModelClassifier = {
      async classify() {
        called = true;
        return { categoryId: 'dining', confidence: 1, reasoning: '' };
      },
    };
    const p = new CategorizationPipeline(spy, { confidenceThreshold: 0.8, localOnly: true });
    const r = await p.categorize(input);
    expect(called).toBe(false);
    expect(r.needsReview).toBe(true);
  });

  it('uses learned history in local_only mode when available', async () => {
    const p = new CategorizationPipeline(ok, { confidenceThreshold: 0.8, localOnly: true });
    p.loadProfile({
      merchantKey: 'uber eats',
      categoryDistribution: { dining: 5 },
      userConfirmedCategoryId: null,
      transactionCount: 5,
    });
    expect((await p.categorize(input)).categoryId).toBe('dining');
  });
});
