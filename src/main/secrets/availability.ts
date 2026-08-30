import type { EncryptionProbe } from './backend';

export class EncryptionUnavailableError extends Error {
  override readonly name = 'EncryptionUnavailableError';
}

const EXPLANATION =
  'Money cannot start: OS-provided encryption is unavailable, so the financial ' +
  'database cannot be encrypted at rest. On macOS this requires Keychain access, ' +
  'on Windows the Credential store, and on Linux a running secret service ' +
  '(libsecret/gnome-keyring). The application refuses to run rather than write ' +
  'unencrypted financial data to disk.';

/**
 * Gate startup on encryption availability.
 *
 * Constitution VII and FR-054: fail loudly. There is deliberately no fallback
 * path — an unencrypted financial database is a worse outcome than not running.
 * Must be called after `app.ready`; on Linux availability depends on a secret
 * service being present and can legitimately be false.
 */
export async function assertEncryptionAvailable(backend: EncryptionProbe): Promise<void> {
  let available: boolean;
  try {
    available = await backend.isEncryptionAvailable();
  } catch (cause) {
    // A probe that throws is not a reason to proceed optimistically.
    throw new EncryptionUnavailableError(EXPLANATION, { cause });
  }
  if (!available) {
    throw new EncryptionUnavailableError(EXPLANATION);
  }
}
