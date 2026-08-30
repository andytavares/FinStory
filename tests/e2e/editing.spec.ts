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

test.describe('income visibility and report detail', () => {
  let h: Harness;

  test.beforeAll(async () => {
    h = await launch();
    await h.page.locator('#root').waitFor({ timeout: 20_000 });
    await dismissSetup(h.page);
  });
  test.afterAll(async () => {
    await h.close();
  });

  test('the transaction log can be filtered to money in or money out', async () => {
    await h.page.getByRole('button', { name: 'Transactions' }).click();
    await expect(h.page.getByRole('button', { name: 'Money in' })).toBeVisible();
    await expect(h.page.getByRole('button', { name: 'Money out' })).toBeVisible();
    await h.page.getByRole('button', { name: 'Money in' }).click();
    await expect(h.page.getByRole('button', { name: 'Money in' })).toBeVisible();
  });

  test('a custom report can be generated over a date range', async () => {
    await h.page.getByRole('button', { name: 'Reports' }).click();
    await h.page.getByRole('button', { name: 'Custom range…' }).click();
    await h.page.getByLabel('Report start date').fill('2026-08-01');
    await h.page.getByLabel('Report end date').fill('2026-08-31');
    await h.page.getByLabel('Report name').fill('August review');
    await h.page.getByRole('button', { name: 'Generate' }).click();
    await expect(h.page.getByText('Custom report ready.')).toBeVisible({ timeout: 15_000 });
    await expect(h.page.getByText('August review')).toBeVisible();
  });

  test('a report opens to a detailed view and can be closed', async () => {
    await h.page.getByText('August review').click();
    await expect(h.page.getByText('← All reports')).toBeVisible({ timeout: 10_000 });
    await h.page.getByText('← All reports').click();
    await expect(h.page.getByRole('button', { name: 'Custom range…' })).toBeVisible();
  });

  test('a report can be deleted', async () => {
    const before = await h.page.getByLabel(/^Delete report from/).count();
    await h.page.getByLabel(/^Delete report from/).first().click();
    await expect
      .poll(async () => h.page.getByLabel(/^Delete report from/).count(), { timeout: 10_000 })
      .toBeLessThan(before);
  });
});
