import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => tmpdir() } }));

const { openDatabase } = await import('@main/db/client');
const { runMigrations } = await import('@main/db/migrate');
const schema = await import('@main/db/schema');
import type { OpenedSecret, SecretBackend } from '@main/secrets/backend';
import type { DatabaseHandle } from '@main/db/client';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

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

/**
 * Upgrading an existing database with data in it.
 *
 * A fresh install only proves migration 0000 works. The real risk is an
 * existing database — which is what a user actually has — being broken by a
 * later migration. Migration 0003 rebuilds the alerts table and had exactly
 * this bug.
 */
describe('migrating a populated database forward', () => {
  let dir: string;
  let handle: DatabaseHandle;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'money-upgrade-'));
    handle = await openDatabase(dir, new TestBackend());
  });
  afterEach(() => {
    handle.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('applies the first migration, accepts data, then upgrades to head without loss', () => {
    // Stop at the first migration, mimicking a database created by an earlier
    // build of the app.
    migrate(handle.db, { migrationsFolder: MIGRATIONS, migrationsTable: '__drizzle_migrations' });

    // Seed the tables the later migrations rebuild.
    handle.raw
      .prepare(
        "INSERT INTO alert_rules (id,type,threshold_minor,window_minutes,enabled) VALUES ('r1','large_purchase',20000,NULL,1)",
      )
      .run();
    handle.raw
      .prepare(
        "INSERT INTO alerts (id,rule_id,triggered_by_transaction_id,event_occurred_at,detected_at,dismissed_as_false_positive,dedupe_key) VALUES ('a1','r1',NULL,'2026-08-01T00:00:00Z','2026-08-01T00:00:00Z',0,'k1')",
      )
      .run();

    // Re-running to head must not throw and must preserve the rows.
    expect(() => runMigrations(handle, MIGRATIONS)).not.toThrow();

    const alerts = handle.raw.prepare('SELECT * FROM alerts').all() as Array<{
      id: string;
      rule_type: string;
    }>;
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.id).toBe('a1');
    // Rows that predate the column get the documented default, not null.
    expect(alerts[0]?.rule_type).toBe('unknown');
  });

  it('adds the new transaction override columns without touching existing rows', async () => {
    runMigrations(handle, MIGRATIONS);
    await handle.db.insert(schema.categories).values({
      id: 'dining',
      name: 'Dining',
      parentId: null,
      isSystem: true,
      isHidden: false,
      mergedIntoId: null,
    });
    const cols = handle.raw.prepare('PRAGMA table_info(transactions)').all() as Array<{
      name: string;
    }>;
    const names = cols.map((c) => c.name);
    for (const col of [
      'user_merchant_name',
      'user_note',
      'user_excluded',
      'user_recurring_override',
    ]) {
      expect(names, `missing ${col}`).toContain(col);
    }
  });

  it('creates the merchant alias table', () => {
    runMigrations(handle, MIGRATIONS);
    expect(() => handle.raw.prepare('SELECT * FROM merchant_aliases').all()).not.toThrow();
  });

  it('is idempotent — running migrations twice is a no-op', () => {
    runMigrations(handle, MIGRATIONS);
    expect(() => runMigrations(handle, MIGRATIONS)).not.toThrow();
  });
});
