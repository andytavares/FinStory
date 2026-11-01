import { defineConfig } from '@playwright/test';

/** Regenerates the user-guide screenshots: `npm run docs:screenshots`. */
export default defineConfig({
  testDir: './scripts/docs',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  timeout: 180_000,
});
