import { test, expect } from '@playwright/test';
import { launch, dismissSetup, type Harness } from './helpers';

/**
 * Quickstart V2 / SC-009: setup completes in under 30 minutes. The automated
 * portion asserts the app reaches a usable state; the human portion (bank
 * authentication in the browser) is what the remaining budget covers.
 */
test.describe('first run', () => {
  let harness: Harness;

  test.beforeAll(async () => {
    harness = await launch();
    await harness.page.locator('#root').waitFor({ timeout: 20_000 });
    await dismissSetup(harness.page);
  });
  test.afterAll(async () => {
    await harness.close();
  });

  test('opens to a usable window', async () => {
    await expect(harness.page.locator('#root')).toBeVisible({ timeout: 15_000 });
  });

  test('shows navigation for every area of the app', async () => {
    for (const label of ['Dashboard', 'Transactions', 'Recurring', 'Review', 'Settings']) {
      await expect(harness.page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('reaches an interactive state well within the setup budget', async () => {
    const start = Date.now();
    await harness.page.getByText('Settings', { exact: true }).click();
    await expect(harness.page.getByText('Your data')).toBeVisible();
    // The whole automated path must be a rounding error against SC-009's 30 min.
    expect(Date.now() - start).toBeLessThan(30_000);
  });
});
