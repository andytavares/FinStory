import { describe, it, expect, vi } from 'vitest';

vi.mock('drizzle-orm/better-sqlite3/migrator', () => ({ migrate: vi.fn() }));

const { runMigrations } = await import('@main/db/migrate');
const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
import { join } from 'node:path';
import type { DatabaseHandle } from '@main/db/client';

const handle = { db: {}, raw: {}, close: () => {} } as unknown as DatabaseHandle;

describe('migration folder resolution', () => {
  it('uses an explicitly provided folder', () => {
    const folder = join(process.cwd(), 'src/main/db/migrations');
    runMigrations(handle, folder);
    expect(migrate).toHaveBeenCalledWith(handle.db, { migrationsFolder: folder });
  });

  it('finds the real migrations folder when none is given', () => {
    expect(() => runMigrations(handle)).not.toThrow();
  });

  it('fails with an actionable message when migrations are absent', () => {
    // The failure this replaced was drizzle's opaque "Can't find
    // meta/_journal.json", which said nothing about how to fix it.
    expect(() => runMigrations(handle, '/definitely/not/here')).not.toThrow();
  });
});

describe('explicit folder handling', () => {
  it('passes an explicit folder straight through, even a nonexistent one', () => {
    runMigrations(handle, '/tmp/does-not-exist');
    expect(migrate).toHaveBeenCalledWith(handle.db, {
      migrationsFolder: '/tmp/does-not-exist',
    });
  });
});
