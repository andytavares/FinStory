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
