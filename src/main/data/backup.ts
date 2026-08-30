import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseHandle } from '@main/db/client';

/**
 * Backup, restore, and delete.
 *
 * FR-060: with no server-side copy, a lost disk means lost data. Backup is
 * therefore first-class, not a buried menu item.
 *
 * The backup is the encrypted database plus its sealed key. Both are needed:
 * the database alone is unreadable, and the key alone is useless. They are
 * copied together deliberately — a "backup" that produced an unopenable file
 * would be worse than none, because the user would believe they were covered.
 */

const DB_FILE = 'money.sqlite';
const KEY_FILE = 'money.key';

export interface BackupResult {
  readonly databasePath: string;
  readonly keyPath: string;
}

export function exportBackup(
  handle: DatabaseHandle,
  userDataDir: string,
  destDir: string,
): BackupResult {
  // Checkpoint WAL into the main file first, or the copy misses recent writes.
  handle.raw.pragma('wal_checkpoint(TRUNCATE)');

  const databasePath = join(destDir, DB_FILE);
  const keyPath = join(destDir, KEY_FILE);
  copyFileSync(join(userDataDir, DB_FILE), databasePath);
  copyFileSync(join(userDataDir, KEY_FILE), keyPath);
  return { databasePath, keyPath };
}

export function restoreBackup(srcDir: string, userDataDir: string): void {
  const db = join(srcDir, DB_FILE);
  const key = join(srcDir, KEY_FILE);
  if (!existsSync(db) || !existsSync(key)) {
    throw new Error(
      'Backup is incomplete: both the database and its key file are required to restore',
    );
  }
  copyFileSync(db, join(userDataDir, DB_FILE));
  copyFileSync(key, join(userDataDir, KEY_FILE));
}

/** FR-048: delete everything. Irreversible, and the caller must confirm. */
export function deleteAllData(userDataDir: string): void {
  for (const file of [DB_FILE, KEY_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
    rmSync(join(userDataDir, file), { force: true });
  }
}
