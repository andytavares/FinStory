import { test, expect } from '@playwright/test';
import { launch, dismissSetup, type Harness } from './helpers';

test.describe('usage tracking', () => {
  let harness: Harness;

  test.beforeAll(async () => {
    harness = await launch();
    await dismissSetup(harness.page);
  });
  test.afterAll(async () => {
    await harness.close();
  });

  test('counts visited screens and streams new events live', async () => {
    const { page } = harness;
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await page.getByRole('button', { name: 'Transactions' }).click();
    await page.getByRole('button', { name: 'Usage' }).click();

    const bars = page.locator('section', { hasText: 'Most and least used' });
    for (const label of ['Dashboard', 'Transactions']) {
      const row = bars.locator('li').filter({ has: page.getByText(label, { exact: true }) });
      await expect(row).toContainText(/[1-9]\d*$/);
    }

    const stream = page.getByTestId('usage-stream');
    const before = await stream.locator('li').count();
    await page.getByRole('button', { name: 'Health' }).click();
    await page.getByRole('button', { name: 'Usage' }).click();
    await expect(stream.locator('li', { hasText: 'Health' }).first()).toBeVisible();
    expect(await stream.locator('li').count()).toBeGreaterThan(before);
  });
});
