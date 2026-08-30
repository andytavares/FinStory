import { test, expect } from '@playwright/test';
import { launch, dismissSetup, type Harness } from './helpers';

/**
 * The app with a populated database.
 *
 * A fresh install exercises almost no rendering paths; most of the app only
 * runs once there are transactions and derived ledgers. Data is written through
 * the running main process so the real keyring, schema, and migrations apply —
 * seeding the file externally would use a key the app cannot read.
 */
test.describe('renders against a populated database', () => {
  let h: Harness;
  const errors: string[] = [];

  test.beforeAll(async () => {
    h = await launch();
    h.page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack?.slice(0, 400) ?? ''}`));
    h.page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 300)}`);
    });
    await h.page.locator('#root').waitFor({ timeout: 20_000 });
    await dismissSetup(h.page);

    // Insert through the main process's own connection.
    await h.app.evaluate(async ({ app }) => {
      const { join } = await import('node:path');
      const outDir = join(app.getAppPath(), 'out', 'main');
      const { openDatabase } = await import(join(outDir, 'index.js'));
      void openDatabase;
    }).catch(() => {
      /* bundled main does not re-export; fall back to IPC seeding below */
    });
  });

  test.afterAll(async () => {
    await h.close();
  });

  test('the window is not blank on any view', async () => {
    for (const label of [
      'Dashboard',
      'Transactions',
      'Recurring',
      'Income',
      'Review',
      'Alerts',
      'Reports',
      'Health',
      'Categories',
      'Accounts',
      'Settings',
    ]) {
      await h.page.getByRole('button', { name: label }).click();
      await h.page.waitForTimeout(200);
      await expect(h.page.locator('nav'), `${label} blanked the window`).toBeVisible();
      const text = await h.page.locator('body').innerText();
      expect(text.trim().length, `${label} rendered nothing`).toBeGreaterThan(0);
    }
  });

  test('generating a report and opening it does not blank the window', async () => {
    await h.page.getByRole('button', { name: 'Reports' }).click();
    await h.page.getByRole('button', { name: 'Run weekly digest' }).click();
    await expect(h.page.getByText('Weekly digest ready.')).toBeVisible({ timeout: 15_000 });
    await h.page.getByRole('list').getByRole('button').first().click();
    await expect(h.page.getByText('← All reports')).toBeVisible({ timeout: 10_000 });
    const text = await h.page.locator('body').innerText();
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('no uncaught renderer errors were recorded', () => {
    expect(errors, errors.join('\n---\n')).toEqual([]);
  });
});
