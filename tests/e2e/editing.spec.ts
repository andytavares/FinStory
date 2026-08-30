import { test, expect } from '@playwright/test';
import { launch, dismissSetup, type Harness } from './helpers';

/** The controls the user said were missing. */
test.describe('user control over transactions, alerts, and reports', () => {
  let harness: Harness;

  test.beforeAll(async () => {
    harness = await launch();
    await harness.page.locator('#root').waitFor({ timeout: 20_000 });
    await dismissSetup(harness.page);
  });
  test.afterAll(async () => {
    await harness.close();
  });

  test('alert rules are editable, not just on/off', async () => {
    await harness.page.getByRole('button', { name: 'Alerts' }).click();
    // Default rules seed on first read, each with an editable threshold.
    // Scope to the rule list: the same wording also appears in the add-rule
    // dropdown's options.
    const rules = harness.page.getByRole('list').first();
    await expect(rules.getByText(/A single purchase over an amount/)).toBeVisible({
      timeout: 10_000,
    });
    const threshold = harness.page.getByLabel(/^Threshold for/).first();
    await expect(threshold).toBeVisible();
    await expect(threshold).toHaveValue('200');
  });

  test('a new alert can be created, including a second of the same kind', async () => {
    await expect(harness.page.getByRole('button', { name: 'Add alert' })).toBeVisible();
    const before = await harness.page.getByLabel(/^Threshold for/).count();
    await harness.page.getByLabel('New alert value').fill('1000');
    await harness.page.getByRole('button', { name: 'Add alert' }).click();
    await expect
      .poll(async () => harness.page.getByLabel(/^Threshold for/).count(), { timeout: 10_000 })
      .toBeGreaterThan(before);
  });

  test('a report can be run on demand', async () => {
    await harness.page.getByRole('button', { name: 'Reports' }).click();
    await expect(harness.page.getByRole('button', { name: 'Run monthly report' })).toBeVisible();
    await harness.page.getByRole('button', { name: 'Run monthly report' }).click();
    await expect(harness.page.getByText(/Monthly report ready/)).toBeVisible({ timeout: 15_000 });
  });

  test('the generated report then appears in the list', async () => {
    await expect(harness.page.getByText(/Monthly report/).first()).toBeVisible({ timeout: 10_000 });
  });
});
