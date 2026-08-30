import { safeStorage } from 'electron';
import type { OpenedSecret, SecretBackend } from './backend';

/** Production backend. Async API per Electron's own recommendation (research.md R5). */
export class ElectronSecretBackend implements SecretBackend {
  async isEncryptionAvailable(): Promise<boolean> {
    return safeStorage.isAsyncEncryptionAvailable();
  }

  async encryptString(plain: string): Promise<Buffer> {
    return safeStorage.encryptStringAsync(plain);
  }

  async decryptString(cipher: Buffer): Promise<OpenedSecret> {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(cipher);
    return { value: result, shouldReEncrypt };
  }
}
