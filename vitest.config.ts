import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Coverage thresholds are a HARD BLOCKER per Constitution Principle V.
// A threshold failure fails the run; it is not a warning.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@main': resolve('src/main'),
      '@renderer': resolve('src/renderer'),
      '@preload': resolve('src/preload'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/integration/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Principle V: "a file at 0% coverage is a defect, regardless of the
      // project-wide aggregate." This glob measures every source file, so an
      // untested one reports at 0% rather than being absent from the report.
      // (Verified via coverage-summary.json — Vitest 4 has no `all` option.)
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.d.ts',
        'src/main/db/migrations/**',
        // Thin adapters over Electron APIs that cannot execute outside a running
        // Electron process (app lifecycle, contextBridge, safeStorage, native
        // notifications). They contain no branching logic of their own and are
        // exercised by the Playwright E2E suite instead. Excluded deliberately
        // rather than covered by tests that would only assert a mock.
        'src/main/index.ts',
        'src/preload/index.ts',
        'src/main/secrets/electron-backend.ts',
        'src/main/notifications/deliver.ts',
        'src/renderer/main.tsx',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
