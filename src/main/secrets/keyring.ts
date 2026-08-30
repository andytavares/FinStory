import { randomBytes } from 'node:crypto';
import type { OpenedSecret, SecretBackend } from './backend';

/**
 * Seals and opens secrets through the OS backend.
 *
 * Two layers with distinct jobs (research.md R5): `safeStorage` protects one
 * small secret — the database key — while SQLCipher encrypts every page of the
 * database with it. safeStorage is a string encryptor, not a database.
 */
export class Keyring {
  constructor(private readonly backend: SecretBackend) {}

  /** 256-bit key as lowercase hex, for SQLCipher. */
  static generateDatabaseKey(): string {
    return randomBytes(32).toString('hex');
  }

  async seal(secret: string): Promise<Buffer> {
    if (secret.length === 0) {
      throw new TypeError('Refusing to seal an empty secret');
    }
    return this.backend.encryptString(secret);
  }

  /**
   * Open a sealed secret. Returns the rotation flag alongside the value so the
   * caller can re-seal; discarding it would leave secrets under a retired key.
   */
  async open(sealed: Buffer): Promise<OpenedSecret> {
    return this.backend.decryptString(sealed);
  }
}
