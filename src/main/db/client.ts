import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { join } from 'node:path';
import * as schema from './schema';
import { Keyring } from '@main/secrets/keyring';
import { DATABASE_KEY_ACCOUNT, type SecretStore } from '@main/secrets/secret-store';
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

/** `keyring` is only needed to read a database key left by the safeStorage-era `money.key`. */
export async function openDatabase(
  userDataDir: string,
  store: SecretStore,
  keyring?: Keyring,
): Promise<DatabaseHandle> {
  const key = await loadOrCreateKey(userDataDir, store, keyring);
  const raw = new Database(join(userDataDir, DB_FILE));

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
