import { test, expect } from '@playwright/test';
import { launch, dismissSetup, type Harness } from './helpers';

/** The two things the user could not do: connect an account, and choose a model. */
test.describe('connect and model selection', () => {
  let harness: Harness;

  test.beforeAll(async () => {
    harness = await launch();
    await harness.page.locator('#root').waitFor({ timeout: 20_000 });
    await dismissSetup(harness.page);
  });
  test.afterAll(async () => {
    await harness.close();
  });

  test('setup leads straight to Accounts, where connecting is the obvious action', async () => {
    await expect(harness.page.getByRole('button', { name: 'Connect an account' })).toBeVisible();
  });

  test('explains what happens before any account is connected', async () => {
    await expect(harness.page.getByText(/No accounts connected yet/)).toBeVisible();
    await expect(harness.page.getByText(/never enter a transaction by hand/)).toBeVisible();
  });

  test('offers all three categorization providers with their privacy stated', async () => {
    await harness.page.getByRole('button', { name: 'Settings' }).click();
    const radios = harness.page.getByRole('radiogroup', { name: 'Who sorts new merchants' }).getByRole('radio');
    await expect(radios).toHaveCount(3);
    await expect(radios.nth(0)).toHaveAccessibleName('Ollama (local)');
    await expect(radios.nth(1)).toHaveAccessibleName('Claude');
    await expect(radios.nth(2)).toHaveAccessibleName('History only');
    await expect(radios.nth(0)).toHaveAccessibleDescription(/Nothing leaves this machine at all/);
    await expect(radios.nth(1)).toHaveAccessibleDescription(/Never account numbers, balances/);
  });

  test('defaults to Haiku and offers the other Claude models', async () => {
    await harness.page.getByRole('button', { name: 'Settings' }).click();
    const select = harness.page.locator('select').first();
    await expect(select).toHaveValue('claude-haiku-4-5');
    await expect(select.locator('option')).toHaveCount(3);
  });

  test('switching to Ollama lists models installed on this machine', async () => {
    await harness.page.getByRole('button', { name: 'Settings' }).click();
    await harness.page.getByRole('radio', { name: 'Ollama (local)' }).click();
    // Either a picker (Ollama running) or a clear explanation (not running).
    await expect(
      harness.page.getByText(/Installed model|No local models found/),
    ).toBeVisible({ timeout: 10_000 });
  });
});
