import { describe, it, expect } from 'vitest';
import { IpcRegistry, IpcFailure } from '@main/ipc/registry';
import { z } from 'zod';

describe('IPC registry validates on the main side (FR-047)', () => {
  it('rejects a malformed payload with VALIDATION_FAILED', async () => {
    const r = new IpcRegistry();
    r.handle('test:echo', z.object({ n: z.number() }), async (p) => p.n);
    await expect(r.invoke('test:echo', { n: 'not a number' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('passes a valid payload through', async () => {
    const r = new IpcRegistry();
    r.handle('test:echo', z.object({ n: z.number() }), async (p) => p.n * 2);
    await expect(r.invoke('test:echo', { n: 21 })).resolves.toBe(42);
  });

  it('maps an unknown channel to an error rather than crashing', async () => {
    const r = new IpcRegistry();
    await expect(r.invoke('nope', {})).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('preserves a typed IpcFailure thrown by a handler', async () => {
    const r = new IpcRegistry();
    r.handle('test:boom', z.object({}), async () => {
      throw new IpcFailure('PLAID_REAUTH_REQUIRED', 'Reconnect required', true, 'Reconnect');
    });
    await expect(r.invoke('test:boom', {})).rejects.toMatchObject({
      code: 'PLAID_REAUTH_REQUIRED',
      recoverable: true,
      action: 'Reconnect',
    });
  });

  it('wraps an unexpected error as INTERNAL without leaking its message', async () => {
    const r = new IpcRegistry();
    r.handle('test:leak', z.object({}), async () => {
      throw new Error('connection string postgres://user:hunter2@host');
    });
    let message = '';
    try {
      await r.invoke('test:leak', {});
    } catch (e) {
      message = (e as { message: string }).message;
    }
    expect(message).not.toContain('hunter2');
    expect(message).toBe('An unexpected error occurred');
  });

  it('never returns secret values from a settings-shaped handler', async () => {
    const r = new IpcRegistry();
    r.handle('setup:status', z.object({}), async () => ({
      plaidConfigured: true,
      categorizationConfigured: true,
      accountCount: 3,
      encryptionAvailable: true,
    }));
    const result = await r.invoke('setup:status', {});
    expect(JSON.stringify(result)).not.toMatch(/secret|api[_-]?key|access[_-]?token/i);
  });
});

describe('offline reads never fail (FR-059)', () => {
  it('a read handler marked offline-safe returns stored data on network failure', async () => {
    const r = new IpcRegistry();
    const fallback = { rows: [], totalMinor: 0, dataComplete: false, staleInstitutions: ['all'] };
    r.handleOfflineSafe(
      'breakdown:byCategory',
      z.object({}),
      async () => {
        throw new IpcFailure('NETWORK_UNAVAILABLE', 'offline', true);
      },
      async () => fallback,
    );
    await expect(r.invoke('breakdown:byCategory', {})).resolves.toEqual(fallback);
  });

  it('still surfaces a non-network failure', async () => {
    const r = new IpcRegistry();
    r.handleOfflineSafe(
      'breakdown:byCategory',
      z.object({}),
      async () => {
        throw new IpcFailure('DB_LOCKED', 'locked', false);
      },
      async () => ({}),
    );
    await expect(r.invoke('breakdown:byCategory', {})).rejects.toMatchObject({ code: 'DB_LOCKED' });
  });
});
