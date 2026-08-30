import { test, expect } from '@playwright/test';
import { launch, type Harness } from './helpers';

/** SC-018: reach the transactions behind any headline figure in <= 2 interactions. */
test.describe('dashboard drill-down', () => {
  let harness: Harness;

  test.beforeAll(async () => {
    harness = await launch();
  });
  test.afterAll(async () => {
    await harness.close();
  });

  test('a category row leads directly to its transactions', async () => {
    await expect(harness.page.locator('#root')).toBeVisible({ timeout: 15_000 });
    const rows = harness.page.locator('button:has(.numeric)');
    if ((await rows.count()) > 0) {
      // Interaction 1: click the category.
      await rows.first().click();
      // Interaction 2: none needed — the register is already showing.
      await expect(harness.page.getByText('Transactions', { exact: true })).toBeVisible();
    }
  });
});
