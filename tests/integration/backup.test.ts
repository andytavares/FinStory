import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, type DatabaseHandle } from '@main/db/client';
import { runMigrations } from '@main/db/migrate';
import { exportBackup, restoreBackup, deleteAllData } from '@main/data/backup';
import { MemorySecretStore } from '../fixtures/memory-secret-store';

const MIGRATIONS = join(process.cwd(), 'src/main/db/migrations');
const PASSPHRASE = 'correct horse battery';

describe('backup round-trip onto a clean install (FR-060, SC-017)', () => {
  let home: string;
  let backupDir: string;
  let freshHome: string;
  let original: DatabaseHandle;
  let originalStore: MemorySecretStore;

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), 'money-home-'));
    backupDir = mkdtempSync(join(tmpdir(), 'money-backup-'));
    freshHome = mkdtempSync(join(tmpdir(), 'money-fresh-'));
    originalStore = new MemorySecretStore();
    original = await openDatabase(home, originalStore);
    runMigrations(original, MIGRATIONS);
    original.raw
      .prepare("INSERT INTO categories (id,name,is_system,is_hidden) VALUES ('g','Groceries',1,0)")
      .run();
  });
  afterEach(() => {
    for (const d of [home, backupDir, freshHome]) rmSync(d, { recursive: true, force: true });
  });

  const exportOptions = () => ({
    handle: original,
    store: originalStore,
    userDataDir: home,
    destDir: backupDir,
    passphrase: PASSPHRASE,
  });

  it('restores the complete prior state on a new machine with a different store', async () => {
    await exportBackup(exportOptions());
    original.close();

    const newMacStore = new MemorySecretStore();
    await restoreBackup({
      srcDir: backupDir,
      userDataDir: freshHome,
      store: newMacStore,
      passphrase: PASSPHRASE,
    });
    const restored = await openDatabase(freshHome, newMacStore);
    const row = restored.raw.prepare("SELECT name FROM categories WHERE id='g'").get() as {
      name: string;
    };
    expect(row.name).toBe('Groceries');
    restored.close();
  });

  it('never writes the database key in the clear', async () => {
    await exportBackup(exportOptions());
    const keyFile = readFileSync(join(backupDir, 'money.backup-key'), 'utf8');
    expect(keyFile).not.toContain((await originalStore.get('database-key')) as string);
    expect(JSON.parse(keyFile)).toMatchObject({ v: 1, kdf: 'scrypt', N: 2 ** 15, r: 8, p: 1 });
  });

  it('rejects a short passphrase and writes nothing', async () => {
    await expect(exportBackup({ ...exportOptions(), passphrase: 'short' })).rejects.toThrow(/8/);
    expect(existsSync(join(backupDir, 'money.sqlite'))).toBe(false);
  });

  it('throws on a wrong passphrase and changes nothing', async () => {
    await exportBackup(exportOptions());
    const newMacStore = new MemorySecretStore();
    await expect(
      restoreBackup({
        srcDir: backupDir,
        userDataDir: freshHome,
        store: newMacStore,
        passphrase: 'not the passphrase',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringMatching(/passphrase/i),
    });
    expect(existsSync(join(freshHome, 'money.sqlite'))).toBe(false);
    expect(newMacStore.items.size).toBe(0);
  });

  it('closes the open database and drops its WAL before replacing the file', async () => {
    await exportBackup(exportOptions());
    original.raw
      .prepare(
        "INSERT INTO categories (id,name,is_system,is_hidden) VALUES ('later','Added after backup',0,0)",
      )
      .run();

    await restoreBackup({
      srcDir: backupDir,
      userDataDir: home,
      store: originalStore,
      passphrase: PASSPHRASE,
      handle: original,
    });

    expect(original.raw.open).toBe(false);
    expect(existsSync(join(home, 'money.sqlite-wal'))).toBe(false);
    const reopened = await openDatabase(home, originalStore);
    const later = reopened.raw.prepare("SELECT id FROM categories WHERE id='later'").get();
    expect(later).toBeUndefined();
    reopened.close();
  });

  it('recovers when restore stops after swapping the file but before saving the new key', async () => {
    await exportBackup(exportOptions());
    const otherStore = new FailingOnceStore('database-key');
    const other = await openDatabase(freshHome, otherStore);
    runMigrations(other, MIGRATIONS);
    otherStore.armed = true;

    await expect(
      restoreBackup({
        srcDir: backupDir,
        userDataDir: freshHome,
        store: otherStore,
        passphrase: PASSPHRASE,
        handle: other,
      }),
    ).rejects.toThrow();

    const reopened = await openDatabase(freshHome, otherStore);
    expect(reopened.raw.prepare("SELECT name FROM categories WHERE id='g'").get()).toEqual({
      name: 'Groceries',
    });
    expect(await otherStore.get('database-key')).toBe(await originalStore.get('database-key'));
    expect(await otherStore.get('database-key.pending')).toBeNull();
    reopened.close();
  });

  it('refuses a backup whose database does not open with its key, and keeps the current data', async () => {
    await exportBackup(exportOptions());
    const stranger = mkdtempSync(join(tmpdir(), 'money-stranger-'));
    const strangerDb = await openDatabase(stranger, new MemorySecretStore());
    strangerDb.close();
    copyFileSync(join(stranger, 'money.sqlite'), join(backupDir, 'money.sqlite'));

    await expect(
      restoreBackup({
        srcDir: backupDir,
        userDataDir: home,
        store: originalStore,
        passphrase: PASSPHRASE,
        handle: original,
      }),
    ).rejects.toThrow(/does not open/);
    expect(original.raw.prepare("SELECT name FROM categories WHERE id='g'").get()).toEqual({
      name: 'Groceries',
    });
    rmSync(stranger, { recursive: true, force: true });
  });

  it('refuses an incomplete backup rather than producing an unopenable database', async () => {
    mkdirSync(join(backupDir, 'empty'), { recursive: true });
    await expect(
      restoreBackup({
        srcDir: join(backupDir, 'empty'),
        userDataDir: freshHome,
        store: new MemorySecretStore(),
        passphrase: PASSPHRASE,
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringMatching(/incomplete/i),
    });
  });

  it('deletes the files and every Keychain item on reset (FR-048)', async () => {
    await originalStore.set('plaid-client-id', 'a');
    await originalStore.set('plaid-secret', 'b');
    await originalStore.set('anthropic-api-key', 'c');
    await originalStore.set('plaid-access-token:inst_1', 'd');
    original.close();

    await deleteAllData({ userDataDir: home, store: originalStore, institutionIds: ['inst_1'] });

    expect(existsSync(join(home, 'money.sqlite'))).toBe(false);
    expect(existsSync(join(home, 'money.key'))).toBe(false);
    expect(originalStore.items.size).toBe(0);
  });
});

/** A store whose next write to one account fails, like a crash at that step. */
class FailingOnceStore extends MemorySecretStore {
  armed = false;
  constructor(private readonly account: string) {
    super();
  }
  override async set(name: string, value: string): Promise<void> {
    if (this.armed && name === this.account) {
      this.armed = false;
      throw new Error('Keychain write interrupted');
    }
    await super.set(name, value);
  }
}
