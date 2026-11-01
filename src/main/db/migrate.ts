import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseHandle } from './client';

/**
 * Locate the migrations folder.
 *
 * The bundled main process lives in `out/main/`, while migrations are copied
 * next to it at build time. In a packaged app they sit inside the asar under
 * the same relative path. Dev runs from source. Each candidate is checked so a
 * missing folder fails with a clear message rather than drizzle's opaque
 * "Can't find meta/_journal.json".
 */
function resolveMigrationsFolder(): string {
  const candidates = [
    join(__dirname, 'migrations'),
    join(__dirname, '../../src/main/db/migrations'),
    join(process.cwd(), 'src/main/db/migrations'),
  ];
  // Read Electron's packaged flag without importing it: this module is also
  // used by tooling and tests that run outside an Electron process.
  const electronApp = (globalThis as { process?: { resourcesPath?: string } }).process;
  const isPackaged = Boolean(electronApp?.resourcesPath) && !__dirname.includes('/src/');
  if (isPackaged && electronApp?.resourcesPath) {
    candidates.unshift(join(electronApp.resourcesPath, 'app.asar', 'out/main/migrations'));
  }

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'meta', '_journal.json'))) return candidate;
  }
  throw new Error(
    `Database migrations are missing. Looked in:\n${candidates.join('\n')}\n` +
      'Run "npm run build" to copy them into the bundle.',
  );
}

/**
 * Apply pending migrations. Foreign keys go off for the run: SQLite ignores the pragma
 * inside a transaction, and a table rebuild's DROP TABLE would cascade-delete child rows.
 */
export function runMigrations(handle: DatabaseHandle, migrationsFolder?: string): void {
  handle.raw.pragma('foreign_keys = OFF');
  try {
    migrate(handle.db, { migrationsFolder: migrationsFolder ?? resolveMigrationsFolder() });
  } finally {
    handle.raw.pragma('foreign_keys = ON');
  }
}
