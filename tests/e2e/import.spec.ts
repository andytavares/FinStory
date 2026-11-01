import { test, expect } from '@playwright/test';
import { launch, dismissSetup, type Harness } from './helpers';

const QUICKEN_MAC_CSV = [
  'Quicken Register Export,01/01/2025 - 01/31/2025',
  'Date,Account,Payee,Category,Memo,Amount,Check #',
  '1/14/2025,Checking,Trader Joes Market,Food:Groceries,,-45.67,',
  '1/15/2025,Checking,Acme Payroll,Income:Salary,,1234.56,',
  '1/16/2025,Checking,Blue Bottle Coffee,Food:Coffee,,-6.50,',
].join('\r\n');

test.describe('Quicken import', () => {
  let harness: Harness;

  test.beforeAll(async () => {
    harness = await launch();
    await dismissSetup(harness.page);
  });
  test.afterAll(async () => {
    await harness.close();
  });

  test('imports a Quicken for Mac CSV into a new account and shows it in Transactions', async () => {
    const { page } = harness;
    await page.getByRole('button', { name: 'Import' }).click();
    await page.getByLabel('Quicken file').setInputFiles({
      name: 'register.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(QUICKEN_MAC_CSV),
    });

    await expect(page.getByText('Match accounts', { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel('Money account for Checking')).toHaveValue('new');
    await page.getByRole('button', { name: 'Check 3 transactions' }).click();
    await page.getByRole('button', { name: 'Import 3 transactions' }).click();
    await expect(page.getByText('Imported 3 transactions')).toBeVisible();

    await page.getByRole('button', { name: 'View transactions' }).click();
    for (const payee of ['Trader Joes Market', 'Acme Payroll', 'Blue Bottle Coffee']) {
      await expect(page.getByText(payee).first()).toBeVisible();
    }
  });
});
