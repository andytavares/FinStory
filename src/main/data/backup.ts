import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { opensWithKey, type DatabaseHandle } from '@main/db/client';
import { IpcFailure } from '@main/ipc/registry';
import {
  accessTokenAccount,
  CREDENTIAL_ACCOUNTS,
  DATABASE_KEY_ACCOUNT,
  PENDING_DATABASE_KEY_ACCOUNT,
  type SecretStore,
} from '@main/secrets/secret-store';
import { MIN_PASSPHRASE_LENGTH } from '@shared/schemas';

/**
 * Backup, restore, and delete.
 *
 * FR-060: with no server-side copy, a lost disk means lost data. Backup is
 * therefore first-class, not a buried menu item.
 *
 * The backup is the encrypted database plus its database key, locked with a
 * passphrase. The key lives in this Mac's Keychain, so without the passphrase
 * copy a backup could not be opened on a new Mac.
 */

const DB_FILE = 'money.sqlite';
const BACKUP_KEY_FILE = 'money.backup-key';
const LEGACY_KEY_FILE = 'money.key';
const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
/** scrypt refuses to run above this; it also caps the cost a damaged file can demand. */
const SCRYPT_MAX_MEMORY = 256 * 1024 * 1024;

interface BackupKeyFile {
  readonly v: 1;
  readonly kdf: 'scrypt';
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly salt: string;
  readonly iv: string;
  readonly tag: string;
  readonly data: string;
}

export interface BackupResult {
  readonly databasePath: string;
  readonly keyPath: string;
}

function deriveKey(
  passphrase: string,
  salt: Buffer,
  params: Pick<BackupKeyFile, 'N' | 'r' | 'p'>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(passphrase, salt, 32, { ...params, maxmem: SCRYPT_MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

async function lockKey(databaseKey: string, passphrase: string): Promise<BackupKeyFile> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    await deriveKey(passphrase, salt, SCRYPT_PARAMS),
    iv,
  );
  const data = Buffer.concat([cipher.update(databaseKey, 'utf8'), cipher.final()]);
  return {
    v: 1,
    kdf: 'scrypt',
    ...SCRYPT_PARAMS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

async function unlockKey(file: BackupKeyFile, passphrase: string): Promise<string> {
  try {
    const key = await deriveKey(passphrase, Buffer.from(file.salt, 'base64'), file);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(file.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(file.tag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(file.data, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    // IpcFailure, or the IPC layer would replace this message with a generic one.
    throw new IpcFailure(
      'VALIDATION_FAILED',
      'Wrong passphrase, or the backup key file is damaged. Nothing was changed.',
      false,
    );
  }
}

export interface ExportOptions {
  readonly handle: DatabaseHandle;
  readonly store: SecretStore;
  readonly userDataDir: string;
  readonly destDir: string;
  readonly passphrase: string;
}

export async function exportBackup(options: ExportOptions): Promise<BackupResult> {
  const { handle, store, userDataDir, destDir, passphrase } = options;
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`The passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
  }
  const databaseKey = await store.get(DATABASE_KEY_ACCOUNT);
  if (!databaseKey) throw new Error('The database key is missing from the Keychain');

  // Checkpoint WAL into the main file first, or the copy misses recent writes.
  handle.raw.pragma('wal_checkpoint(TRUNCATE)');

  const databasePath = join(destDir, DB_FILE);
  const keyPath = join(destDir, BACKUP_KEY_FILE);
  copyFileSync(join(userDataDir, DB_FILE), databasePath);
  writeFileSync(keyPath, JSON.stringify(await lockKey(databaseKey, passphrase)));
  return { databasePath, keyPath };
}

export interface RestoreOptions {
  readonly srcDir: string;
  readonly userDataDir: string;
  readonly store: SecretStore;
  readonly passphrase: string;
  /** The open database, closed before its file is replaced. */
  readonly handle?: DatabaseHandle;
}

export async function restoreBackup(options: RestoreOptions): Promise<void> {
  const { srcDir, userDataDir, store, passphrase, handle } = options;
  const backupDb = join(srcDir, DB_FILE);
  const backupKey = join(srcDir, BACKUP_KEY_FILE);
  if (!existsSync(backupDb) || !existsSync(backupKey)) {
    throw new IpcFailure(
      'VALIDATION_FAILED',
      'Backup is incomplete: both the database and its key file are required to restore',
      false,
    );
  }
  const databaseKey = await unlockKey(
    JSON.parse(readFileSync(backupKey, 'utf8')) as BackupKeyFile,
    passphrase,
  );

  // Copy beside the live file first so a failed copy leaves the current data intact.
  const staged = join(userDataDir, `${DB_FILE}.restore`);
  copyFileSync(backupDb, staged);
  if (!opensWithKey(staged, databaseKey)) {
    rmSync(staged, { force: true });
    throw new IpcFailure(
      'VALIDATION_FAILED',
      'The backup database does not open with its key',
      false,
    );
  }
  // Pending first: if this stops after the swap, startup promotes it (openDatabase).
  await store.set(PENDING_DATABASE_KEY_ACCOUNT, databaseKey);
  handle?.close();
  rmSync(join(userDataDir, `${DB_FILE}-wal`), { force: true });
  rmSync(join(userDataDir, `${DB_FILE}-shm`), { force: true });
  renameSync(staged, join(userDataDir, DB_FILE));
  await store.set(DATABASE_KEY_ACCOUNT, databaseKey);
  await store.delete(PENDING_DATABASE_KEY_ACCOUNT);
}

export interface DeleteOptions {
  readonly userDataDir: string;
  readonly store: SecretStore;
  readonly institutionIds: readonly string[];
}

/** FR-048: delete everything, files and Keychain items. Irreversible, and the caller must confirm. */
export async function deleteAllData(options: DeleteOptions): Promise<void> {
  const { userDataDir, store, institutionIds } = options;
  for (const file of [DB_FILE, LEGACY_KEY_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
    rmSync(join(userDataDir, file), { force: true });
  }
  const accounts = [
    DATABASE_KEY_ACCOUNT,
    PENDING_DATABASE_KEY_ACCOUNT,
    ...Object.values(CREDENTIAL_ACCOUNTS),
    ...institutionIds.map(accessTokenAccount),
  ];
  for (const account of accounts) await store.delete(account);
}
