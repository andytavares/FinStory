import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, dismissSetup } from '../../tests/e2e/helpers';
import { seedExampleData } from '../../tests/e2e/fixtures/seed';

const OUT = process.env['SHOTS_DIR'] ?? join(__dirname, '../../docs/user-guide/img');
const SCREENS = [
  'Dashboard', 'Transactions', 'Recurring', 'Income', 'Review', 'Alerts', 'Reports', 'Usage',
  'Categories', 'Rules', 'Accounts', 'Import', 'Health', 'Settings',
];
const slug = (label: string): string => label.toLowerCase().replace(/\s+/g, '-');

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
      await h.page.locator('nav').getByRole('button', { name: label, exact: true }).click();
      await h.page.waitForTimeout(800);
      await h.page.screenshot({ path: join(OUT, `${slug(label)}.png`) });
    }
  } finally {
    await h.close();
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
