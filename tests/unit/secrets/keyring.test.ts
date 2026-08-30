import { describe, it, expect, beforeEach } from 'vitest';
import { Keyring } from '@main/secrets/keyring';
import type { OpenedSecret, SecretBackend } from '@main/secrets/backend';

/** Reversible stand-in for the OS backend; proves round-trip without a keychain. */
class FakeBackend implements SecretBackend {
  async isEncryptionAvailable(): Promise<boolean> {
    return true;
  }
  // Must actually transform: a fake that embeds the plaintext would make the
  // "ciphertext does not contain the secret" assertion vacuous.
  async encryptString(plain: string): Promise<Buffer> {
    return Buffer.from(Buffer.from(plain, 'utf8').toString('base64').split('').reverse().join(''), 'utf8');
  }
  async decryptString(cipher: Buffer): Promise<OpenedSecret> {
    const value = Buffer.from(cipher.toString('utf8').split('').reverse().join(''), 'base64').toString('utf8');
    return { value, shouldReEncrypt: false };
  }
}

describe('keyring', () => {
  let keyring: Keyring;
  beforeEach(() => {
    keyring = new Keyring(new FakeBackend());
  });

  it('generates a database key of sufficient length', () => {
    const key = Keyring.generateDatabaseKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates a different key every time', () => {
    expect(Keyring.generateDatabaseKey()).not.toBe(Keyring.generateDatabaseKey());
  });

  it('round-trips a secret through the backend', async () => {
    const sealed = await keyring.seal('access-sandbox-abc123');
    expect(sealed.toString('utf8')).not.toContain('access-sandbox-abc123');
    expect((await keyring.open(sealed)).value).toBe('access-sandbox-abc123');
  });

  it('round-trips a generated database key', async () => {
    const key = Keyring.generateDatabaseKey();
    expect((await keyring.open(await keyring.seal(key))).value).toBe(key);
  });

  it('surfaces the OS key-rotation flag rather than discarding it', async () => {
    const rotating: SecretBackend = {
      isEncryptionAvailable: async () => true,
      encryptString: async (p) => Buffer.from(p, 'utf8'),
      decryptString: async (c) => ({ value: c.toString('utf8'), shouldReEncrypt: true }),
    };
    expect((await new Keyring(rotating).open(Buffer.from('k', 'utf8'))).shouldReEncrypt).toBe(true);
  });

  it('rejects sealing an empty secret', async () => {
    await expect(keyring.seal('')).rejects.toThrow(/empty/i);
  });
});
