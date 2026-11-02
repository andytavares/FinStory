import { test, expect } from '@playwright/test';
import { launch, dismissSetup, type Harness } from './helpers';

/** US6: the review queue, bulk selection, and the retroactive prompt. */
test.describe('review queue', () => {
  let harness: Harness;

  test.beforeAll(async () => {
    harness = await launch();
    await harness.page.locator('#root').waitFor({ timeout: 20_000 });
    await dismissSetup(harness.page);
  });
  test.afterAll(async () => {
    await harness.close();
  });

  test('opens the review queue', async () => {
    await expect(harness.page.locator('#root')).toBeVisible({ timeout: 15_000 });
    await harness.page.getByRole('button', { name: 'Review' }).click();
    // With no data yet the empty state is correct and must be informative.
    await expect(
      harness.page.getByText(/Nothing needs your review|flagged/),
    ).toBeVisible();
  });

  test('offers manual entry only as an option on Transactions (SC-021, Constitution VIII)', async () => {
    for (const label of ['Dashboard', 'Review']) {
      await harness.page.getByRole('button', { name: label }).click();
      await expect(harness.page.getByRole('button', { name: /add transaction/i })).toHaveCount(0);
    }
    await harness.page.getByRole('button', { name: 'Transactions' }).click();
    await expect(harness.page.getByRole('button', { name: /add transaction/i })).toHaveCount(1);
  });
});
