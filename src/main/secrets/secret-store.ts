import { createHash } from 'node:crypto';
import { Entry } from '@napi-rs/keyring';

/** One macOS Keychain item per secret, addressed by account name. */
export interface SecretStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}

export const DATABASE_KEY_ACCOUNT = 'database-key';
/** A restored database's key, saved before its file is swapped in and promoted after. */
export const PENDING_DATABASE_KEY_ACCOUNT = 'database-key.pending';

/** Settings key of each credential, mapped to its Keychain account name. */
export const CREDENTIAL_ACCOUNTS = {
  plaidClientId: 'plaid-client-id',
  plaidSecret: 'plaid-secret',
  anthropicApiKey: 'anthropic-api-key',
} as const;

export type CredentialKey = keyof typeof CREDENTIAL_ACCOUNTS;

export const accessTokenAccount = (institutionId: string): string =>
  `plaid-access-token:${institutionId}`;

/** Dev and test profiles get their own service so they never read another profile's secrets. */
export function keychainService(isPackaged: boolean, userDataDir: string): string {
  if (isPackaged) return 'com.atavares.money';
  const profile = createHash('sha256').update(userDataDir).digest('hex').slice(0, 12);
  return `com.atavares.money.dev.${profile}`;
}

/** The service name is passed in so this file never imports electron. */
export class KeychainSecretStore implements SecretStore {
  constructor(private readonly service: string) {}

  async get(name: string): Promise<string | null> {
    return new Entry(this.service, name).getPassword();
  }

  async set(name: string, value: string): Promise<void> {
    new Entry(this.service, name).setPassword(value);
  }

  async delete(name: string): Promise<void> {
    new Entry(this.service, name).deletePassword();
  }
}
