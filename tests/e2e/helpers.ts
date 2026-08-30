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

export async function launch(): Promise<Harness> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'money-e2e-'));
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
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
