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
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Principle V: "a file at 0% coverage is a defect, regardless of the
      // project-wide aggregate." Without `all`, an untested file is simply
      // absent from the report rather than visibly at zero.
      all: true,
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.d.ts', 'src/main/db/migrations/**'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
