import { describe, it, expect } from 'vitest';
import { assertEncryptionAvailable, EncryptionUnavailableError } from '@main/secrets/availability';

describe('encryption availability gate (FR-054, Constitution VII)', () => {
  it('passes when the platform reports encryption available', async () => {
    await expect(
      assertEncryptionAvailable({ isEncryptionAvailable: async () => true }),
    ).resolves.toBeUndefined();
  });

  it('FAILS LOUDLY when unavailable — never degrades to plaintext', async () => {
    await expect(
      assertEncryptionAvailable({ isEncryptionAvailable: async () => false }),
    ).rejects.toBeInstanceOf(EncryptionUnavailableError);
  });

  it('explains what the user must do rather than emitting a bare failure', async () => {
    let err: EncryptionUnavailableError | undefined;
    try {
      await assertEncryptionAvailable({ isEncryptionAvailable: async () => false });
    } catch (e) {
      err = e as EncryptionUnavailableError;
    }
    expect(err).toBeDefined();
    expect(err?.message).toMatch(/keychain|secret service|credential/i);
    expect(err?.message).toMatch(/refus|cannot start|will not/i);
  });

  it('treats a probe that throws as unavailable rather than swallowing it', async () => {
    await expect(
      assertEncryptionAvailable({
        isEncryptionAvailable: async () => {
          throw new Error('backend offline');
        },
      }),
    ).rejects.toBeInstanceOf(EncryptionUnavailableError);
  });
});
