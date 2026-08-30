import { describe, it, expect } from 'vitest';
import { CategorizationPipeline } from '@main/categorization/pipeline';

const input = {
  transactionId: 't1',
  descriptor: 'SQ *BLUE BOTTLE',
  amountMinor: -750,
  occurredAt: new Date('2026-08-01T12:00:00Z'),
};

describe('the pipeline reports model failures instead of hiding them', () => {
  it('records the real error message when the model throws', async () => {
    const pipeline = new CategorizationPipeline(
      { classify: () => Promise.reject(new Error('401 invalid x-api-key')) },
      { confidenceThreshold: 0.8 },
    );
    await pipeline.categorize(input);
    expect(pipeline.lastModelError).toBe('401 invalid x-api-key');
    expect(pipeline.modelFailures).toBe(1);
  });

  it('still categorizes so ingestion is never blocked', async () => {
    const pipeline = new CategorizationPipeline(
      { classify: () => Promise.reject(new Error('boom')) },
      { confidenceThreshold: 0.8 },
    );
    const result = await pipeline.categorize(input);
    expect(result.transactionId).toBe('t1');
    expect(result.categoryId).not.toBe('');
  });

  it('counts every failure, not just the first', async () => {
    const pipeline = new CategorizationPipeline(
      { classify: () => Promise.reject(new Error('boom')) },
      { confidenceThreshold: 0.8 },
    );
    await pipeline.categorize(input);
    await pipeline.categorize({ ...input, transactionId: 't2', descriptor: 'ACME WIDGETS LLC' });
    expect(pipeline.modelFailures).toBe(2);
  });

  it('leaves no error recorded when the model works', async () => {
    const pipeline = new CategorizationPipeline(
      { classify: () => Promise.resolve({ categoryId: 'coffee', confidence: 0.9, reasoning: 'ok' }) },
      { confidenceThreshold: 0.8 },
    );
    const result = await pipeline.categorize(input);
    expect(result.source).toBe('model');
    expect(pipeline.lastModelError).toBeNull();
    expect(pipeline.modelFailures).toBe(0);
  });

  it('records nothing in local_only mode, which is a choice and not a failure', async () => {
    const pipeline = new CategorizationPipeline(
      { classify: () => Promise.reject(new Error('never called')) },
      { confidenceThreshold: 0.8, localOnly: true },
    );
    await pipeline.categorize(input);
    expect(pipeline.lastModelError).toBeNull();
    expect(pipeline.modelFailures).toBe(0);
  });
});

describe('the pipeline never returns a category that does not exist', () => {
  const taxonomy = new Set(['dining', 'groceries', 'uncategorizable']);

  it('falls back when the model answers outside the taxonomy', async () => {
    const pipeline = new CategorizationPipeline(
      { classify: async () => ({ categoryId: 'crypto', confidence: 0.99, reasoning: 'sure' }) },
      { confidenceThreshold: 0.8, validCategoryIds: taxonomy },
    );
    const result = await pipeline.categorize(input);
    expect(result.categoryId).toBe('uncategorizable');
    expect(result.needsReview).toBe(true);
    expect(result.reasoning).toContain('crypto');
  });

  it('keeps a model answer that is in the taxonomy', async () => {
    const pipeline = new CategorizationPipeline(
      { classify: async () => ({ categoryId: 'dining', confidence: 0.99, reasoning: 'food' }) },
      { confidenceThreshold: 0.8, validCategoryIds: taxonomy },
    );
    expect((await pipeline.categorize(input)).categoryId).toBe('dining');
  });

  it('falls back when a heuristic names a category the user deleted', async () => {
    const pipeline = new CategorizationPipeline(
      { classify: () => Promise.reject(new Error('none')) },
      { confidenceThreshold: 0.8, localOnly: true, validCategoryIds: taxonomy },
    );
    // 'coffee' is a heuristic match for Blue Bottle and is absent above.
    const result = await pipeline.categorize({ ...input, descriptor: 'BLUE BOTTLE COFFEE' });
    expect(result.categoryId).toBe('uncategorizable');
  });

  it('keeps a heuristic answer that is in the taxonomy', async () => {
    const pipeline = new CategorizationPipeline(
      { classify: () => Promise.reject(new Error('none')) },
      { confidenceThreshold: 0.8, localOnly: true, validCategoryIds: taxonomy },
    );
    const result = await pipeline.categorize({ ...input, descriptor: 'TRADER JOES 118' });
    expect(result.categoryId).toBe('groceries');
  });

  it('accepts anything when no taxonomy is supplied', async () => {
    const pipeline = new CategorizationPipeline(
      { classify: async () => ({ categoryId: 'anything', confidence: 0.9, reasoning: '' }) },
      { confidenceThreshold: 0.8 },
    );
    expect((await pipeline.categorize(input)).categoryId).toBe('anything');
  });

  it('ignores learned history pointing at a deleted category', async () => {
    const pipeline = new CategorizationPipeline(
      { classify: () => Promise.reject(new Error('none')) },
      { confidenceThreshold: 0.8, localOnly: true, validCategoryIds: taxonomy },
    );
    pipeline.confirmCategory('zzqx test merchant', 'deleted-category');
    const result = await pipeline.categorize({ ...input, descriptor: 'ZZQX TEST MERCHANT' });
    expect(result.categoryId).toBe('uncategorizable');
  });
});
