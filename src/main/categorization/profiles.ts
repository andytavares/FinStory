import type { CategorizationPipeline } from './pipeline';
import type { merchantProfiles } from '@main/db/schema';

/** Seed the pipeline with the user's learned and corrected merchants. */
export function loadMerchantProfiles(
  rows: ReadonlyArray<typeof merchantProfiles.$inferSelect>,
  pipeline: CategorizationPipeline,
): void {
  for (const row of rows) {
    pipeline.loadProfile({
      merchantKey: row.merchantKey,
      categoryDistribution: JSON.parse(row.categoryDistribution) as Record<string, number>,
      userConfirmedCategoryId: row.userConfirmedCategoryId,
      transactionCount: row.transactionCount,
    });
  }
}
