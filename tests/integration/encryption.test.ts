import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase } from '@main/db/client';
import { runMigrations } from '@main/db/migrate';
import type { OpenedSecret, SecretBackend } from '@main/secrets/backend';

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
    const handle = await openDatabase(dir, new TestBackend());
    runMigrations(handle, join(process.cwd(), 'src/main/db/migrations'));
    handle.raw.prepare("INSERT INTO categories (id,name,is_system,is_hidden) VALUES ('x','SecretCategoryName',0,0)").run();
    handle.close();
    expect(existsSync(join(dir, 'money.sqlite'))).toBe(true);
  });

  it('is NOT readable by an unkeyed SQLite client', async () => {
    const handle = await openDatabase(dir, new TestBackend());
    runMigrations(handle, join(process.cwd(), 'src/main/db/migrations'));
    handle.close();

    const unkeyed = new Database(join(dir, 'money.sqlite'));
    expect(() => unkeyed.prepare('SELECT count(*) FROM sqlite_master').get()).toThrow();
    unkeyed.close();
  });

  it('leaves no plaintext data in the file on disk', async () => {
    const handle = await openDatabase(dir, new TestBackend());
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
    const first = await openDatabase(dir, new TestBackend());
    runMigrations(first, join(process.cwd(), 'src/main/db/migrations'));
    first.raw.prepare("INSERT INTO categories (id,name,is_system,is_hidden) VALUES ('z','Groceries',0,0)").run();
    first.close();

    const second = await openDatabase(dir, new TestBackend());
    const row = second.raw.prepare("SELECT name FROM categories WHERE id='z'").get() as { name: string };
    expect(row.name).toBe('Groceries');
    second.close();
  });
});
