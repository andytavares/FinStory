import { test, expect } from '@playwright/test';
import { launch, type Harness } from './helpers';

/**
 * The test that was missing.
 *
 * `electron-vite build` only bundles — it never starts anything, so a green
 * build said nothing about whether the app runs. Two real startup failures got
 * through that gap: a missing Electron binary, and migrations that were never
 * copied into the bundle. This asserts the app actually boots.
 */
test.describe('the app actually starts', () => {
  let harness: Harness;

  test.beforeAll(async () => {
    harness = await launch();
  });
  test.afterAll(async () => {
    await harness.close();
  });

  test('opens a window and renders the root', async () => {
    await expect(harness.page.locator('#root')).toBeVisible({ timeout: 20_000 });
  });

  test('reports no uncaught exception during bootstrap', async () => {
    const errors: string[] = [];
    harness.page.on('pageerror', (e) => errors.push(e.message));
    await harness.page.waitForTimeout(1500);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('completes bootstrap: creates the encrypted database and its key', async () => {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    await expect
      .poll(() => existsSync(join(harness.userDataDir, 'money.sqlite')), { timeout: 20_000 })
      .toBe(true);
    expect(existsSync(join(harness.userDataDir, 'money.key'))).toBe(true);
  });

  test('renders the first-run setup screen, not an empty shell', async () => {
    await expect(harness.page.getByText(/Connect your accounts/)).toBeVisible({ timeout: 20_000 });
  });
});
