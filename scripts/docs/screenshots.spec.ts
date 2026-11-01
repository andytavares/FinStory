import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, dismissSetup } from '../../tests/e2e/helpers';
import { seedExampleData } from '../../tests/e2e/fixtures/seed';

const OUT = process.env['SHOTS_DIR'] ?? join(process.cwd(), 'docs/user-guide/img');
const SCREENS = [
  'Dashboard', 'Transactions', 'Recurring', 'Income', 'Review', 'Alerts', 'Reports', 'Usage',
  'Categories', 'Rules', 'Accounts', 'Import', 'Health', 'Settings',
];
const slug = (label: string): string => label.toLowerCase().replace(/\s+/g, '-');
type Page = Awaited<ReturnType<typeof launch>>['page'];

const openScreen = async (page: Page, label: string): Promise<void> => {
  await page.locator('nav').getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(800);
};

/** The extra states: the transaction side panel, a report's detail and the privacy settings. */
async function captureStates(page: Page): Promise<void> {
  await openScreen(page, 'Transactions');
  await page.locator('tbody tr').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'transactions-panel.png') });

  await openScreen(page, 'Reports');
  await page.getByRole('button', { name: /^Run .* report$/ }).click();
  await page.getByRole('button', { name: 'Open report' }).first().click();
  await page.getByRole('button', { name: 'Export PDF' }).waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, 'report-detail.png') });

  await openScreen(page, 'Settings');
  await page.getByRole('group', { name: 'Settings sections' }).getByRole('button', { name: 'Data and privacy' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, 'settings-privacy.png') });
}

test('captures every screen with example data', async () => {
  mkdirSync(OUT, { recursive: true });
  const h = await launch();
  const errors: string[] = [];
  h.page.on('pageerror', (e) => errors.push(e.message));
  try {
    await h.page.setViewportSize({ width: 1280, height: 820 });
    await h.page.locator('input[aria-label="Client ID"], nav').first().waitFor({ timeout: 20_000 });
    await h.page.screenshot({ path: join(OUT, 'setup.png') });
    await dismissSetup(h.page);
    await seedExampleData(h.app, h.page, h.userDataDir);
    for (const label of SCREENS) {
      await openScreen(h.page, label);
      await h.page.screenshot({ path: join(OUT, `${slug(label)}.png`) });
    }
    await captureStates(h.page);
  } finally {
    await h.close();
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
