import { describe, it, expect } from 'vitest';
import { pathSchema, importSchema, exportSchema } from '@shared/schemas';

describe('export paths', () => {
  it('accepts an empty destination, which means "open a save dialog"', () => {
    expect(pathSchema.parse({ destPath: '' })).toEqual({ destPath: '' });
    expect(importSchema.parse({ srcPath: '', passphrase: 'long enough' }).srcPath).toBe('');
  });

  it('accepts an explicit destination', () => {
    expect(pathSchema.parse({ destPath: '/tmp/x.json' }).destPath).toBe('/tmp/x.json');
  });

  it('still rejects a non-string destination', () => {
    expect(() => pathSchema.parse({ destPath: 5 })).toThrow();
  });
})

describe('backup passphrase', () => {
  it('rejects a passphrase under 8 characters on export and import', () => {
    expect(() => exportSchema.parse({ destPath: '', passphrase: 'short' })).toThrow();
    expect(() => importSchema.parse({ srcPath: '', passphrase: 'short' })).toThrow();
  });

  it('accepts 8 characters', () => {
    expect(exportSchema.parse({ destPath: '', passphrase: '12345678' }).passphrase).toBe('12345678');
  });
});
