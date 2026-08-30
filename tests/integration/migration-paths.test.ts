import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => tmpdir() } }));

const { openDatabase } = await import('@main/db/client');
const { runMigrations } = await import('@main/db/migrate');
import type { OpenedSecret, SecretBackend } from '@main/secrets/backend';
import type { DatabaseHandle } from '@main/db/client';

class TestBackend implements SecretBackend {
  async isEncryptionAvailable(): Promise<boolean> {
    return true;
  }
  async encryptString(p: string): Promise<Buffer> {
    return Buffer.from(p, 'utf8');
  }
  async decryptString(c: Buffer): Promise<OpenedSecret> {
    return { value: c.toString('utf8'), shouldReEncrypt: false };
  }
}

const MIGRATIONS = join(process.cwd(), 'src/main/db/migrations');

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Build a migrations folder containing only the first `count` migrations, and
 * run it — producing exactly the database an older build would have left,
 * journal included.
 */
function migrateUpTo(handle: DatabaseHandle, count: number): void {
  const partial = mkdtempSync(join(tmpdir(), 'money-mig-'));
  mkdirSync(join(partial, 'meta'), { recursive: true });

  for (const file of migrationFiles().slice(0, count)) {
    copyFileSync(join(MIGRATIONS, file), join(partial, file));
  }
  // Snapshots only — copying _journal.json here would overwrite the truncated
  // one written above and defeat the whole point of the fixture.
  for (const snap of readdirSync(join(MIGRATIONS, 'meta')).filter(
    (f) => f.endsWith('.json') && f !== '_journal.json',
  )) {
    copyFileSync(join(MIGRATIONS, 'meta', snap), join(partial, 'meta', snap));
  }

  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: unknown[] };
  writeFileSync(
    join(partial, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: journal.entries.slice(0, count) }),
  );

  runMigrations(handle, partial);
  rmSync(partial, { recursive: true, force: true });
}

/**
 * Upgrading from every historical schema version.
 *
 * A user's database sits at whatever migration their last build shipped. If any
 * later migration fails against it, the app cannot start — and a failed
 * bootstrap is exactly what a blank window looks like. Testing only the newest
 * path would never catch it.
 */
describe('upgrading from every prior schema version', () => {
  let dir: string;
  let handle: DatabaseHandle;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'money-path-'));
    handle = await openDatabase(dir, new TestBackend());
  });
  afterEach(() => {
    handle.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('has more than one migration to test', () => {
    expect(migrationFiles().length).toBeGreaterThan(1);
  });

  for (const [index, file] of migrationFiles().entries()) {
    it(`upgrades to head from a database stopped after ${file}`, () => {
      migrateUpTo(handle, index + 1);
      // Now upgrade to head, exactly as the app does on launch.
      expect(() => runMigrations(handle, MIGRATIONS)).not.toThrow();
      // And the database must still be usable afterwards.
      expect(() =>
        handle.raw.prepare('SELECT count(*) FROM transactions').get(),
      ).not.toThrow();
    });
  }
});
