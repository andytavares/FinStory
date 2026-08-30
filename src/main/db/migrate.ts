import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { join } from 'node:path';
import type { DatabaseHandle } from './client';

/** Apply pending migrations. Runs on every launch; drizzle tracks what is applied. */
export function runMigrations(handle: DatabaseHandle, migrationsFolder?: string): void {
  migrate(handle.db, {
    migrationsFolder: migrationsFolder ?? join(__dirname, 'migrations'),
  });
}
