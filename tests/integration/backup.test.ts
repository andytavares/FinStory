import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '@main/db/client';
import { runMigrations } from '@main/db/migrate';
import { exportBackup, restoreBackup, deleteAllData } from '@main/data/backup';
import type { OpenedSecret, SecretBackend } from '@main/secrets/backend';

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

const MIGRATIONS = join(process.cwd(), 'src/main/db/migrations');

describe('backup round-trip onto a clean install (FR-060, SC-017)', () => {
  let home: string;
  let backupDir: string;
  let freshHome: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'money-home-'));
    backupDir = mkdtempSync(join(tmpdir(), 'money-backup-'));
    freshHome = mkdtempSync(join(tmpdir(), 'money-fresh-'));
  });
  afterEach(() => {
    for (const d of [home, backupDir, freshHome]) rmSync(d, { recursive: true, force: true });
  });

  it('restores the complete prior state', async () => {
    const original = await openDatabase(home, new TestBackend());
    runMigrations(original, MIGRATIONS);
    original.raw
      .prepare("INSERT INTO categories (id,name,is_system,is_hidden) VALUES ('g','Groceries',1,0)")
      .run();
    exportBackup(original, home, backupDir);
    original.close();

    restoreBackup(backupDir, freshHome);
    const restored = await openDatabase(freshHome, new TestBackend());
    const row = restored.raw.prepare("SELECT name FROM categories WHERE id='g'").get() as {
      name: string;
    };
    expect(row.name).toBe('Groceries');
    restored.close();
  });

  it('refuses an incomplete backup rather than producing an unopenable database', () => {
    mkdirSync(join(backupDir, 'empty'), { recursive: true });
    expect(() => restoreBackup(join(backupDir, 'empty'), freshHome)).toThrow(/incomplete/i);
  });

  it('deletes everything on request (FR-048)', async () => {
    const handle = await openDatabase(home, new TestBackend());
    runMigrations(handle, MIGRATIONS);
    handle.close();
    deleteAllData(home);
    expect(existsSync(join(home, 'money.sqlite'))).toBe(false);
    expect(existsSync(join(home, 'money.key'))).toBe(false);
  });
});
