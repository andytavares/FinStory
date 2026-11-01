import { describe, it, expect } from 'vitest';
import { keychainService } from '@main/secrets/secret-store';

describe('keychainService', () => {
  it('uses the product service name for the installed app', () => {
    expect(keychainService(true, '/Users/a/Library/Application Support/money')).toBe(
      'com.atavares.money',
    );
  });

  it('gives each development profile its own service, so profiles never share secrets', () => {
    const first = keychainService(false, '/tmp/money-e2e-a');
    const second = keychainService(false, '/tmp/money-e2e-b');
    expect(first).toMatch(/^com\.atavares\.money\.dev\.[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
    expect(keychainService(false, '/tmp/money-e2e-a')).toBe(first);
  });
});
