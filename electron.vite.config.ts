import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { cpSync, existsSync } from 'node:fs';

/**
 * Migrations are data, not code, so the bundler does not pick them up. Copy
 * them next to the bundled main process; without this the app starts and then
 * fails at runtime looking for meta/_journal.json.
 */
function copyMigrations() {
  return {
    name: 'copy-migrations',
    closeBundle(): void {
      const from = resolve('src/main/db/migrations');
      if (!existsSync(from)) throw new Error(`Migrations not found at ${from}`);
      cpSync(from, resolve('out/main/migrations'), { recursive: true });
    },
  };
}

// Three-context split. Secrets, network, and database access live only in `main`.
// The renderer runs with contextIsolation and no Node integration; see src/main/index.ts.
export default defineConfig({
  main: {
    plugins: [copyMigrations()],
    build: {
      rollupOptions: {
        // Native module — must not be bundled.
        external: ['better-sqlite3'],
      },
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main'),
      },
    },
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer'),
      },
    },
  },
});
