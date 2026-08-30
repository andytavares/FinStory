import { test, expect } from '@playwright/test';
import { launch, type Harness } from './helpers';

/** US6: the review queue, bulk selection, and the retroactive prompt. */
test.describe('review queue', () => {
  let harness: Harness;

  test.beforeAll(async () => {
    harness = await launch();
  });
  test.afterAll(async () => {
    await harness.close();
  });

  test('opens the review queue', async () => {
    await expect(harness.page.locator('#root')).toBeVisible({ timeout: 15_000 });
    await harness.page.getByText('Review', { exact: true }).click();
    // With no data yet the empty state is correct and must be informative.
    await expect(
      harness.page.getByText(/Nothing needs your review|flagged/),
    ).toBeVisible();
  });

  test('offers no manual transaction entry anywhere (SC-021)', async () => {
    for (const label of ['Dashboard', 'Transactions', 'Review']) {
      await harness.page.getByText(label, { exact: true }).click();
      await expect(harness.page.getByRole('button', { name: /add transaction/i })).toHaveCount(0);
    }
  });
});
