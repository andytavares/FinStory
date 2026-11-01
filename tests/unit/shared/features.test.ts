import { describe, it, expect } from 'vitest';
import { IpcRegistry } from '@main/ipc/registry';
import { registerHandlers } from '@main/ipc/handlers/index';
import { FEATURES, VIEW_IDS, isFeature, featureLabel } from '@shared/features';
import { stubServices } from '../ipc/stub-services';

describe('the usage catalog covers every feature', () => {
  const registry = new IpcRegistry();
  registerHandlers(registry, stubServices());

  it('has an entry for every registered channel except usage:*', () => {
    const missing = registry
      .channels()
      .filter((channel) => !channel.startsWith('usage:') && !isFeature(channel));
    expect(missing, `add these channels to src/shared/features.ts: ${missing.join(', ')}`).toEqual([]);
  });

  it('has a view entry for every route', () => {
    const missing = VIEW_IDS.filter((id) => !isFeature(`view:${id}`));
    expect(missing).toEqual([]);
  });

  it('has unique ids and a label for each', () => {
    const ids = FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(FEATURES.every((f) => f.label.length > 0)).toBe(true);
  });

  it('does not track the usage channels themselves', () => {
    expect(FEATURES.some((f) => f.id.startsWith('usage:'))).toBe(false);
  });

  it('labels a feature and rejects an unknown id', () => {
    expect(featureLabel('transactions:update')).toBe('Transactions: edit');
    expect(isFeature('Uber Eats')).toBe(false);
  });
});
