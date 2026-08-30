import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

// Three-context split. Secrets, network, and database access live only in `main`.
// The renderer runs with contextIsolation and no Node integration; see src/main/index.ts.
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // Native module — must not be bundled.
        external: ['better-sqlite3-multiple-ciphers'],
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
