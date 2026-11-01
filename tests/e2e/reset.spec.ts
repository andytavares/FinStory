import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { launch, dismissSetup } from './helpers';

// FR-048. The restarted app is a process Playwright does not own,
// so the test finds it by its unique user-data dir and stops it.
test('reset erases everything and restarts at setup', async () => {
  const first = await launch();
  const dir = first.userDataDir;
  try {
    await dismissSetup(first.page);
    await first.page.getByRole('button', { name: 'Settings' }).click();
    await first.page.getByRole('button', { name: 'Reset everything' }).click();

    const erase = first.page.getByRole('button', { name: 'Erase and restart' });
    const confirmation = first.page.getByLabel('Reset confirmation');
    await confirmation.fill('delete');
    await expect(erase).toBeDisabled();
    await confirmation.fill('DELETE ALL MY DATA');

    const exited = new Promise<void>((resolve) => first.app.process().once('exit', () => resolve()));
    await erase.click();
    await exited;

    // The relaunched copy must reach setup on its own, then we stop it.
    await expect
      .poll(() => runningFor(dir), { timeout: 20_000 })
      .toBeGreaterThan(0);
    stopAll(dir);

    const second = await launch(dir);
    await expect(second.page.getByLabel('Client ID')).toBeVisible({ timeout: 20_000 });
    await second.app.close();
  } finally {
    stopAll(dir);
    rmSync(dir, { recursive: true, force: true });
  }
});

function runningFor(dir: string): number {
  try {
    return execSync(`pgrep -f -- "--user-data-dir=${dir}"`).toString().trim().split('\n').length;
  } catch {
    return 0;
  }
}

function stopAll(dir: string): void {
  try {
    execSync(`pkill -f -- "--user-data-dir=${dir}"`);
  } catch {
    /* nothing running */
  }
  execSync('sleep 1');
}
