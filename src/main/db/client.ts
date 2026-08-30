import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { join } from 'node:path';
import * as schema from './schema';
import { Keyring } from '@main/secrets/keyring';
import type { SecretBackend } from '@main/secrets/backend';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/**
 * SQLCipher-encrypted database.
 *
 * Two layers (research.md R5): safeStorage protects one small secret — the
 * database key — and SQLCipher encrypts every page with it. safeStorage is a
 * string encryptor, not a database.
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
const KEY_FILE = 'money.key';

async function loadOrCreateKey(userDataDir: string, backend: SecretBackend): Promise<string> {
  const keyring = new Keyring(backend);
  const keyPath = join(userDataDir, KEY_FILE);

  if (existsSync(keyPath)) {
    const opened = await keyring.open(readFileSync(keyPath));
    if (opened.shouldReEncrypt) {
      // The OS rotated its key. Re-seal now rather than leaving the database
      // key protected under a retired one.
      writeFileSync(keyPath, await keyring.seal(opened.value));
    }
    return opened.value;
  }

  const key = Keyring.generateDatabaseKey();
  writeFileSync(keyPath, await keyring.seal(key));
  return key;
}

export async function openDatabase(
  userDataDir: string,
  backend: SecretBackend,
): Promise<DatabaseHandle> {
  const key = await loadOrCreateKey(userDataDir, backend);
  const raw = new Database(join(userDataDir, DB_FILE));

  // Must be the first statement on the connection.
  raw.pragma(`key='${key}'`);
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
