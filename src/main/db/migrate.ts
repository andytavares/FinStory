import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { app } from 'electron';
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
  if (app?.isPackaged) {
    candidates.unshift(join(process.resourcesPath, 'app.asar', 'out/main/migrations'));
  }

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'meta', '_journal.json'))) return candidate;
  }
  throw new Error(
    `Database migrations are missing. Looked in:\n${candidates.join('\n')}\n` +
      'Run "npm run build" to copy them into the bundle.',
  );
}

/** Apply pending migrations. Drizzle tracks which have already run. */
export function runMigrations(handle: DatabaseHandle, migrationsFolder?: string): void {
  migrate(handle.db, { migrationsFolder: migrationsFolder ?? resolveMigrationsFolder() });
}
