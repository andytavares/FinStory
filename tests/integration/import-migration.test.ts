import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => tmpdir() } }));

const { openDatabase } = await import('@main/db/client');
const { runMigrations } = await import('@main/db/migrate');
import type { DatabaseHandle } from '@main/db/client';
import { MemorySecretStore } from '../fixtures/memory-secret-store';

const MIGRATIONS = join(process.cwd(), 'src/main/db/migrations');
const BEFORE_IMPORT_MIGRATION = 9;
const BEFORE_IMPORTED_EVERYDAY = 10;

function migrateFirst(handle: DatabaseHandle, count: number): void {
  const partial = mkdtempSync(join(tmpdir(), 'money-mig-'));
  mkdirSync(join(partial, 'meta'), { recursive: true });
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files.slice(0, count)) copyFileSync(join(MIGRATIONS, file), join(partial, file));
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as {
    entries: unknown[];
  };
  writeFileSync(
    join(partial, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: journal.entries.slice(0, count) }),
  );
  runMigrations(handle, partial);
  rmSync(partial, { recursive: true, force: true });
}

describe('institutions without Plaid', () => {
  let dir: string;
  let handle: DatabaseHandle;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'money-import-mig-'));
    handle = await openDatabase(dir, new MemorySecretStore());
  });
  afterEach(() => {
    handle.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps Plaid institutions, their accounts and transactions, and accepts a null plaid_item_id', () => {
    migrateFirst(handle, BEFORE_IMPORT_MIGRATION);
    const { raw } = handle;
    raw.exec(`
      INSERT INTO institutions (id,plaid_item_id,access_token_encrypted,institution_name,status,created_at) VALUES ('i1','item_1','','Chase','healthy','2026-01-01');
      INSERT INTO accounts (id,institution_id,plaid_account_id,name,type,is_everyday) VALUES ('a1','i1','pa_1','Checking','depository',1);
      INSERT INTO transactions (id,account_id,plaid_transaction_id,amount_minor,description,posted_date,first_seen_at,updated_at) VALUES ('t1','a1','pt_1',-500,'COFFEE','2026-01-02','2026-01-02','2026-01-02');
    `);

    runMigrations(handle, MIGRATIONS);

    expect(raw.prepare('SELECT source, plaid_item_id FROM institutions').all()).toEqual([
      { source: 'plaid', plaid_item_id: 'item_1' },
    ]);
    expect(raw.prepare('SELECT count(*) AS n FROM accounts').get()).toEqual({ n: 1 });
    expect(raw.prepare('SELECT count(*) AS n FROM transactions').get()).toEqual({ n: 1 });

    raw.exec(`INSERT INTO institutions (id,plaid_item_id,access_token_encrypted,institution_name,source,created_at) VALUES ('i2',NULL,'','Quicken import','import','2026-01-01'), ('i3',NULL,'','Another','import','2026-01-01')`);
    expect(raw.prepare("SELECT count(*) AS n FROM institutions WHERE source='import'").get()).toEqual({ n: 2 });
    expect(() =>
      raw.exec(`INSERT INTO institutions (id,plaid_item_id,access_token_encrypted,institution_name,created_at) VALUES ('i4','item_1','','Dup','2026-01-01')`),
    ).toThrow(/UNIQUE/);
  });

  it('makes imported accounts day-to-day and leaves a Plaid savings account alone', () => {
    migrateFirst(handle, BEFORE_IMPORTED_EVERYDAY);
    handle.raw.exec(`
      INSERT INTO institutions (id,plaid_item_id,access_token_encrypted,institution_name,source,created_at) VALUES ('i1','item_1','','Chase','plaid','2026-01-01'), ('i2',NULL,'','Imported from Quicken','import','2026-01-01');
      INSERT INTO accounts (id,institution_id,plaid_account_id,name,type,subtype,is_everyday) VALUES ('a1','i1','pa_1','Savings','depository','savings',0), ('a2','i2','import:a2','Quicken Checking','depository',NULL,0);
    `);

    runMigrations(handle, MIGRATIONS);

    expect(handle.raw.prepare('SELECT id, is_everyday FROM accounts ORDER BY id').all()).toEqual([
      { id: 'a1', is_everyday: 0 },
      { id: 'a2', is_everyday: 1 },
    ]);
  });
});
