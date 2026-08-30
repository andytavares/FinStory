import { describe, it, expect } from 'vitest';
import { IpcRegistry, IpcFailure } from '@main/ipc/registry';
import { z } from 'zod';

/**
 * FR-059 / SC-015: connectivity may fail a sync, never a read. Every read
 * channel must serve stored data with dataComplete false rather than erroring.
 */
const READ_CHANNELS = [
  'dashboard:get',
  'breakdown:byCategory',
  'breakdown:byMerchant',
  'transactions:query',
  'trends:overTime',
  'recurring:list',
  'review:queue',
  'reports:list',
  'income:list',
  'health:get',
];

describe('every read channel survives being offline', () => {
  for (const channel of READ_CHANNELS) {
    it(`${channel} serves stored data when the network is down`, async () => {
      const r = new IpcRegistry();
      const stored = { rows: [], totalMinor: 0, dataComplete: false, staleInstitutions: ['all'] };
      r.handleOfflineSafe(
        channel,
        z.object({}).passthrough(),
        async () => {
          throw new IpcFailure('NETWORK_UNAVAILABLE', 'offline', true);
        },
        async () => stored,
      );
      const result = (await r.invoke(channel, {})) as { dataComplete: boolean };
      expect(result.dataComplete).toBe(false);
    });
  }

  it('a write channel still fails when offline — it must not pretend to succeed', async () => {
    const r = new IpcRegistry();
    r.handle('sync:now', z.object({}), async () => {
      throw new IpcFailure('NETWORK_UNAVAILABLE', 'offline', true);
    });
    await expect(r.invoke('sync:now', {})).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
  });
});
