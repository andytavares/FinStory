import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { DatabaseHandle } from '@main/db/client';
import { institutions, settings } from '@main/db/schema';
import type { Keyring } from './keyring';
import {
  accessTokenAccount,
  CREDENTIAL_ACCOUNTS,
  DATABASE_KEY_ACCOUNT,
  type CredentialKey,
  type SecretStore,
} from './secret-store';

const LEGACY_KEY_FILE = 'money.key';

export interface MigrationOptions {
  readonly db: DatabaseHandle['db'];
  readonly store: SecretStore;
  readonly keyring: Keyring;
  readonly userDataDir: string;
}

/** A value that is only safe to drop from its old home once the store returns it. */
async function setAndVerify(store: SecretStore, account: string, value: string): Promise<void> {
  await store.set(account, value);
  if ((await store.get(account)) !== value) {
    throw new Error(`Keychain read-back did not match for ${account}`);
  }
}

/**
 * Move the safeStorage-sealed `money.key` into the store. Returns the key, or
 * null when there is no legacy file. The file is deleted only after read-back.
 */
export async function migrateDatabaseKeyFile(
  options: Pick<MigrationOptions, 'store' | 'keyring' | 'userDataDir'>,
): Promise<string | null> {
  const keyPath = join(options.userDataDir, LEGACY_KEY_FILE);
  if (!existsSync(keyPath)) return null;
  const { value } = await options.keyring.open(readFileSync(keyPath));
  await setAndVerify(options.store, DATABASE_KEY_ACCOUNT, value);
  rmSync(keyPath);
  return value;
}

interface PendingMove {
  readonly account: string;
  readonly sealed: string;
  readonly clear: () => PromiseLike<unknown>;
}

async function pendingMoves(db: DatabaseHandle['db']): Promise<PendingMove[]> {
  const secretRows = await db.select().from(settings).where(eq(settings.isSecret, true));
  const credentials = secretRows
    .filter((row) => row.value !== '' && row.key in CREDENTIAL_ACCOUNTS)
    .map((row) => ({
      account: CREDENTIAL_ACCOUNTS[row.key as CredentialKey],
      sealed: row.value,
      clear: () => db.delete(settings).where(eq(settings.key, row.key)),
    }));
  const tokens = (await db.select().from(institutions))
    .filter((row) => row.accessTokenEncrypted !== '')
    .map((row) => ({
      account: accessTokenAccount(row.id),
      sealed: row.accessTokenEncrypted,
      clear: () =>
        db.update(institutions).set({ accessTokenEncrypted: '' }).where(eq(institutions.id, row.id)),
    }));
  return [...credentials, ...tokens];
}

/**
 * One-time move of every safeStorage-sealed secret into the store.
 * Idempotent. A failed item keeps its original and is retried next launch.
 * Returns the number of items that failed.
 */
export async function migrateSecretsToKeychain(options: MigrationOptions): Promise<number> {
  let failed = 0;
  const attempt = async (move: () => Promise<unknown>): Promise<void> => {
    try {
      await move();
    } catch {
      failed += 1;
    }
  };

  await attempt(() => migrateDatabaseKeyFile(options));
  for (const move of await pendingMoves(options.db)) {
    await attempt(async () => {
      const { value } = await options.keyring.open(Buffer.from(move.sealed, 'base64'));
      await setAndVerify(options.store, move.account, value);
      await move.clear();
    });
  }
  return failed;
}
