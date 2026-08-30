import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Launch the built Electron app against a throwaway userData directory, so E2E
 * never touches real financial data.
 */
export interface Harness {
  readonly app: ElectronApplication;
  readonly page: Page;
  readonly userDataDir: string;
  close(): Promise<void>;
}

/** Get past first-run setup so nav-dependent tests can reach the shell. */
export async function dismissSetup(page: Page): Promise<void> {
  // Wait for the app to settle on either the setup screen or the shell, so this
  // does not race the initial status query.
  await page
    .locator('input[aria-label="Client ID"], nav')
    .first()
    .waitFor({ timeout: 20_000 });

  const clientId = page.getByLabel('Client ID');
  if (await clientId.isVisible().catch(() => false)) {
    await clientId.fill('e2e-client');
    await page.getByLabel('Secret').fill('e2e-secret');
    await page.getByRole('button', { name: /Save and continue/ }).click();
    await page.getByRole('button', { name: 'Dashboard' }).waitFor({ timeout: 15_000 });
  }
}

export async function launch(seededDir?: string): Promise<Harness> {
  const userDataDir = seededDir ?? mkdtempSync(join(tmpdir(), 'money-e2e-'));
  const app = await electron.launch({
    args: ['./out/main/index.js', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, MONEY_E2E: '1' },
  });
  const page = await app.firstWindow();
  return {
    app,
    page,
    userDataDir,
    close: async () => {
      await app.close();
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}
