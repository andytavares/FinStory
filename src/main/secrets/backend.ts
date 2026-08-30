/**
 * Platform secret storage.
 *
 * Electron's `safeStorage` is the production implementation. The async API is
 * used deliberately: Electron's docs recommend it over the synchronous one
 * because it is non-blocking, supports key rotation, handles temporary backend
 * unavailability, and the sync API may be deprecated in a future release.
 */

/** Probe for the startup gate. Narrower than SecretBackend on purpose. */
export interface EncryptionProbe {
  isEncryptionAvailable(): Promise<boolean>;
}

export interface OpenedSecret {
  readonly value: string;
  /**
   * True when the OS rotated its key and this secret should be re-sealed.
   * Surfaced rather than dropped: ignoring it would leave secrets encrypted
   * under a retired key indefinitely.
   */
  readonly shouldReEncrypt: boolean;
}

export interface SecretBackend extends EncryptionProbe {
  encryptString(plain: string): Promise<Buffer>;
  decryptString(cipher: Buffer): Promise<OpenedSecret>;
}
