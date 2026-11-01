import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase } from '@main/db/client';
import { runMigrations } from '@main/db/migrate';
import { Keyring } from '@main/secrets/keyring';
import type { OpenedSecret, SecretBackend } from '@main/secrets/backend';
import { MemorySecretStore } from '../fixtures/memory-secret-store';

/** Reversible stand-in for the OS keychain, which is unavailable in tests. */
class TestBackend implements SecretBackend {
  async isEncryptionAvailable(): Promise<boolean> {
    return true;
  }
  async encryptString(plain: string): Promise<Buffer> {
    return Buffer.from(Buffer.from(plain, 'utf8').toString('base64'), 'utf8');
  }
  async decryptString(cipher: Buffer): Promise<OpenedSecret> {
    return { value: Buffer.from(cipher.toString('utf8'), 'base64').toString('utf8'), shouldReEncrypt: false };
  }
}

describe('database encryption at rest (FR-054, quickstart V0)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'money-test-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates and persists an encrypted database', async () => {
    const handle = await openDatabase(dir, new MemorySecretStore());
    runMigrations(handle, join(process.cwd(), 'src/main/db/migrations'));
    handle.raw.prepare("INSERT INTO categories (id,name,is_system,is_hidden) VALUES ('x','SecretCategoryName',0,0)").run();
    handle.close();
    expect(existsSync(join(dir, 'money.sqlite'))).toBe(true);
  });

  it('is NOT readable by an unkeyed SQLite client', async () => {
    const handle = await openDatabase(dir, new MemorySecretStore());
    runMigrations(handle, join(process.cwd(), 'src/main/db/migrations'));
    handle.close();

    const unkeyed = new Database(join(dir, 'money.sqlite'));
    expect(() => unkeyed.prepare('SELECT count(*) FROM sqlite_master').get()).toThrow();
    unkeyed.close();
  });

  it('leaves no plaintext data in the file on disk', async () => {
    const handle = await openDatabase(dir, new MemorySecretStore());
    runMigrations(handle, join(process.cwd(), 'src/main/db/migrations'));
    handle.raw
      .prepare("INSERT INTO categories (id,name,is_system,is_hidden) VALUES ('y','UberEatsSecretMarker',0,0)")
      .run();
    handle.close();

    const bytes = readFileSync(join(dir, 'money.sqlite'));
    expect(bytes.includes(Buffer.from('UberEatsSecretMarker'))).toBe(false);
    // Even the SQLite header is encrypted by SQLCipher.
    expect(bytes.subarray(0, 15).toString()).not.toBe('SQLite format 3');
  });

  it('reopens with the stored key and reads its data back', async () => {
    const store = new MemorySecretStore();
    const first = await openDatabase(dir, store);
    runMigrations(first, join(process.cwd(), 'src/main/db/migrations'));
    first.raw.prepare("INSERT INTO categories (id,name,is_system,is_hidden) VALUES ('z','Groceries',0,0)").run();
    first.close();

    const second = await openDatabase(dir, store);
    const row = second.raw.prepare("SELECT name FROM categories WHERE id='z'").get() as { name: string };
    expect(row.name).toBe('Groceries');
    second.close();
  });

  it('generates a key into the store on first run and reuses it', async () => {
    const store = new MemorySecretStore();
    (await openDatabase(dir, store)).close();
    const key = await store.get('database-key');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    (await openDatabase(dir, store)).close();
    expect(await store.get('database-key')).toBe(key);
  });

  it('falls back to a legacy money.key, moves it to the store and deletes the file', async () => {
    const keyring = new Keyring(new TestBackend());
    const legacyKey = Keyring.generateDatabaseKey();
    writeFileSync(join(dir, 'money.key'), await keyring.seal(legacyKey));
    const store = new MemorySecretStore();

    (await openDatabase(dir, store, keyring)).close();

    expect(await store.get('database-key')).toBe(legacyKey);
    expect(existsSync(join(dir, 'money.key'))).toBe(false);
  });

  it('refuses to invent a key for a database that already exists', async () => {
    (await openDatabase(dir, new MemorySecretStore())).close();
    await expect(openDatabase(dir, new MemorySecretStore())).rejects.toThrow(/key/i);
  });

  it('keeps temporary tables in memory so they never reach disk unencrypted', async () => {
    const handle = await openDatabase(dir, new MemorySecretStore());
    expect(handle.raw.pragma('temp_store', { simple: true })).toBe(2);
    handle.close();
  });
});
