import type { SecretStore } from '@main/secrets/secret-store';

/** In-memory stand-in for the macOS Keychain; tests never touch the real one. */
export class MemorySecretStore implements SecretStore {
  readonly items = new Map<string, string>();

  async get(name: string): Promise<string | null> {
    return this.items.get(name) ?? null;
  }
  async set(name: string, value: string): Promise<void> {
    this.items.set(name, value);
  }
  async delete(name: string): Promise<void> {
    this.items.delete(name);
  }
}
