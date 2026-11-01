import { describe, it, expect, vi } from 'vitest';
import { CategorizationPipeline } from '@main/categorization/pipeline';
import { loadMerchantProfiles } from '@main/categorization/profiles';

describe('loadMerchantProfiles', () => {
  it("makes the pipeline answer with the user's category without calling the model", async () => {
    const classify = vi.fn();
    const pipeline = new CategorizationPipeline({ classify }, { confidenceThreshold: 0.8 });
    loadMerchantProfiles(
      [
        {
          merchantKey: 'blue bottle coffee',
          categoryDistribution: '{"dining":2}',
          userConfirmedCategoryId: 'coffee',
          transactionCount: 2,
          lastUpdatedAt: '2026-08-01T00:00:00Z',
        },
      ],
      pipeline,
    );
    const result = await pipeline.categorize({
      transactionId: 't1',
      descriptor: 'BLUE BOTTLE COFFEE',
      amountMinor: -500,
      occurredAt: new Date('2026-08-29T10:00:00Z'),
    });
    expect(result.categoryId).toBe('coffee');
    expect(result.source).toBe('rule');
    expect(classify).not.toHaveBeenCalled();
  });
});
