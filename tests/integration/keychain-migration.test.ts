import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { openDatabase, type DatabaseHandle } from '@main/db/client';
import { runMigrations } from '@main/db/migrate';
import * as schema from '@main/db/schema';
import { Keyring } from '@main/secrets/keyring';
import { migrateSecretsToKeychain } from '@main/secrets/migrate-to-keychain';
import type { OpenedSecret, SecretBackend } from '@main/secrets/backend';
import { MemorySecretStore } from '../fixtures/memory-secret-store';

class TestBackend implements SecretBackend {
  async isEncryptionAvailable(): Promise<boolean> {
    return true;
  }
  async encryptString(plain: string): Promise<Buffer> {
    return Buffer.from(Buffer.from(plain, 'utf8').toString('base64'), 'utf8');
  }
  async decryptString(cipher: Buffer): Promise<OpenedSecret> {
    return {
      value: Buffer.from(cipher.toString('utf8'), 'base64').toString('utf8'),
      shouldReEncrypt: false,
    };
  }
}

class FailingStore extends MemorySecretStore {
  override async set(): Promise<void> {
    throw new Error('Keychain locked');
  }
}

const keyring = new Keyring(new TestBackend());
const seal = async (plain: string): Promise<string> => (await keyring.seal(plain)).toString('base64');

describe('migrateSecretsToKeychain', () => {
  let dir: string;
  let handle: DatabaseHandle;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'money-kc-'));
    handle = await openDatabase(dir, new MemorySecretStore());
    runMigrations(handle, join(process.cwd(), 'src/main/db/migrations'));
    await handle.db
      .insert(schema.settings)
      .values({ key: 'plaidSecret', value: await seal('plaid-secret-value'), isSecret: true });
    await handle.db.insert(schema.institutions).values({
      id: 'inst_1',
      plaidItemId: 'item_1',
      accessTokenEncrypted: await seal('access-token-value'),
      institutionName: 'Bank',
      status: 'healthy',
      createdAt: '2026-08-01T00:00:00Z',
    });
  });
  afterEach(() => {
    handle.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('moves credentials and access tokens to the store, then clears the database', async () => {
    const store = new MemorySecretStore();
    await migrateSecretsToKeychain({ db: handle.db, store, keyring, userDataDir: dir });

    expect(await store.get('plaid-secret')).toBe('plaid-secret-value');
    expect(await store.get('plaid-access-token:inst_1')).toBe('access-token-value');
    expect(await handle.db.select().from(schema.settings).where(eq(schema.settings.key, 'plaidSecret'))).toEqual([]);
    const [inst] = await handle.db.select().from(schema.institutions);
    expect(inst?.accessTokenEncrypted).toBe('');
  });

  it('keeps the database value when the store rejects the write, and reports it', async () => {
    const failed = await migrateSecretsToKeychain({
      db: handle.db,
      store: new FailingStore(),
      keyring,
      userDataDir: dir,
    });

    expect(failed).toBe(2);
    expect(await handle.db.select().from(schema.settings)).toHaveLength(1);
    const [inst] = await handle.db.select().from(schema.institutions);
    expect(inst?.accessTokenEncrypted).not.toBe('');
  });

  it('is a no-op the second time', async () => {
    const store = new MemorySecretStore();
    const options = { db: handle.db, store, keyring, userDataDir: dir };
    await migrateSecretsToKeychain(options);
    const snapshot = new Map(store.items);

    expect(await migrateSecretsToKeychain(options)).toBe(0);
    expect(store.items).toEqual(snapshot);
  });

  it('moves money.key and deletes it only after the read-back', async () => {
    writeFileSync(join(dir, 'money.key'), await keyring.seal('legacy-db-key'));
    const store = new FailingStore();
    await migrateSecretsToKeychain({ db: handle.db, store, keyring, userDataDir: dir });
    expect(existsSync(join(dir, 'money.key'))).toBe(true);

    const working = new MemorySecretStore();
    await migrateSecretsToKeychain({ db: handle.db, store: working, keyring, userDataDir: dir });
    expect(await working.get('database-key')).toBe('legacy-db-key');
    expect(existsSync(join(dir, 'money.key'))).toBe(false);
  });
});
