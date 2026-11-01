import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { join } from 'node:path';
import * as schema from './schema';
import { Keyring } from '@main/secrets/keyring';
import {
  DATABASE_KEY_ACCOUNT,
  PENDING_DATABASE_KEY_ACCOUNT,
  type SecretStore,
} from '@main/secrets/secret-store';
import { migrateDatabaseKeyFile } from '@main/secrets/migrate-to-keychain';
import { existsSync } from 'node:fs';

/**
 * SQLCipher-encrypted database.
 *
 * Two layers (research.md R5): the Keychain holds one small secret — the
 * database key — and SQLCipher encrypts every page with it.
 *
 * The driver is better-sqlite3-multiple-ciphers, adopted under ADR 0001 with a
 * recorded migration trigger.
 */

export interface DatabaseHandle {
  readonly db: BetterSQLite3Database<typeof schema>;
  readonly raw: Database.Database;
  close(): void;
}

const DB_FILE = 'money.sqlite';

async function loadOrCreateKey(
  userDataDir: string,
  store: SecretStore,
  keyring: Keyring | undefined,
): Promise<string> {
  const stored = await store.get(DATABASE_KEY_ACCOUNT);
  if (stored) return stored;

  const migrated = keyring ? await migrateDatabaseKeyFile({ store, keyring, userDataDir }) : null;
  if (migrated) return migrated;

  // A new key cannot open an existing database; fail with the cause instead.
  if (existsSync(join(userDataDir, DB_FILE))) {
    throw new Error(
      'The database key is missing from the Keychain, so the database cannot be opened',
    );
  }
  const key = Keyring.generateDatabaseKey();
  await store.set(DATABASE_KEY_ACCOUNT, key);
  return key;
}

/** True when `key` decrypts the database file at `path`. */
export function opensWithKey(path: string, key: string): boolean {
  const probe = new Database(path, { readonly: true, fileMustExist: true });
  try {
    probe.pragma(`key='${key}'`);
    probe.prepare('SELECT count(*) FROM sqlite_master').get();
    return true;
  } catch {
    return false;
  } finally {
    probe.close();
  }
}

/**
 * A restore saves the new key as pending, swaps the file, then promotes the key.
 * If it stopped in between, the file needs the pending key: promote it now.
 */
async function settlePendingKey(path: string, store: SecretStore): Promise<void> {
  const pending = await store.get(PENDING_DATABASE_KEY_ACCOUNT);
  if (!pending) return;
  const current = await store.get(DATABASE_KEY_ACCOUNT);
  const fileNeedsPending =
    existsSync(path) && !(current && opensWithKey(path, current)) && opensWithKey(path, pending);
  if (fileNeedsPending) await store.set(DATABASE_KEY_ACCOUNT, pending);
  await store.delete(PENDING_DATABASE_KEY_ACCOUNT);
}

/** `keyring` is only needed to read a database key left by the safeStorage-era `money.key`. */
export async function openDatabase(
  userDataDir: string,
  store: SecretStore,
  keyring?: Keyring,
): Promise<DatabaseHandle> {
  const path = join(userDataDir, DB_FILE);
  await settlePendingKey(path, store);
  const key = await loadOrCreateKey(userDataDir, store, keyring);
  const raw = new Database(path);

  // Must be the first statement on the connection.
  raw.pragma(`key='${key}'`);
  // Temp tables and sort spills would otherwise land on disk unencrypted.
  raw.pragma('temp_store = MEMORY');
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');

  // Verify the key actually works — a wrong key fails on first read, not on
  // open, and silently proceeding would look like an empty database.
  raw.prepare('SELECT count(*) FROM sqlite_master').get();

  return {
    db: drizzle(raw, { schema }),
    raw,
    close: () => raw.close(),
  };
}
