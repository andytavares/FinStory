import { describe, it, expect } from 'vitest';
import { IpcRegistry } from '@main/ipc/registry';
import { registerHandlers } from '@main/ipc/handlers/index';
import { stubServices } from './stub-services';

const CONTRACT_CHANNELS = [
  'setup:status',
  'setup:saveCredentials',
  'credentials:update',
  'link:start',
  'link:complete',
  'institutions:list',
  'institutions:disconnect',
  'institutions:reauth',
  'accounts:setEveryday',
  'dashboard:get',
  'breakdown:byCategory',
  'breakdown:byMerchant',
  'transactions:query',
  'transactions:update',
  'transactions:create',
  'trends:overTime',
  'income:list',
  'income:confirm',
  'income:override',
  'income:add',
  'income:clearOverride',
  'income:history',
  'review:queue',
  'review:recategorize',
  'review:applyRetroactive',
  'review:dismissFlag',
  'categories:list',
  'categories:create',
  'categories:rename',
  'categories:merge',
  'categories:setHidden',
  'categories:delete',
  'merchants:rename',
  'recurring:list',
  'recurring:acknowledge',
  'recurring:markNotRecurring',
  'recurring:candidates',
  'recurring:decide',
  'alerts:list',
  'alerts:dismiss',
  'alertRules:list',
  'alertRules:update',
  'alertRules:create',
  'alertRules:delete',
  'reports:list',
  'reports:get',
  'reports:generate',
  'reports:delete',
  'reports:exportPdf',
  'health:get',
  'diagnostics:export',
  'settings:get',
  'models:listOllama',
  'setup:detectOllama',
  'settings:update',
  'data:export',
  'data:import',
  'data:deleteAll',
  'analysis:refresh',
  'sync:now',
  'overrides:list',
  'overrides:clear',
  'rules:list',
  'rules:update',
  'rules:delete',
  'model:status',
  'model:test',
  'categorization:rerun',
  'categorization:cancel',
  'import:preview',
  'import:commit',
  'import:status',
  'usage:view',
  'usage:action',
  'usage:summary',
  'usage:recent',
  'usage:export',
];

/** Valid minimal payload per channel; anything not listed takes {}. */
const CHANNEL_PAYLOADS: Record<string, unknown> = {
  'setup:saveCredentials': { plaidClientId: 'c', plaidSecret: 's', plaidEnv: 'sandbox' },
  'credentials:update': { anthropicApiKey: 'sk-new' },
  'link:complete': { linkToken: 'lt' },
  'institutions:disconnect': { institutionId: 'i' },
  'institutions:reauth': { institutionId: 'i' },
  'accounts:setEveryday': { accountId: 'a', isEveryday: true },
  'dashboard:get': { periodStart: '2026-08-01', periodEnd: '2026-09-01' },
  'breakdown:byCategory': { periodStart: '2026-08-01', periodEnd: '2026-09-01' },
  'breakdown:byMerchant': { periodStart: '2026-08-01', periodEnd: '2026-09-01' },
  'trends:overTime': { periodStart: '2026-08-01', periodEnd: '2026-09-01' },
  'transactions:query': {},
  'transactions:update': { transactionId: 't1' },
  'transactions:create': { accountId: 'a', postedDate: '2026-08-20', amountMinor: -100, payee: 'p', categoryId: 'c' },
  'income:confirm': { id: 'i' },
  'income:override': { id: 'i' },
  'income:clearOverride': { id: 'i' },
  'income:add': { accountId: 'a', cadence: 'monthly', expectedAmountMinor: 100, nextExpectedDate: '2026-09-01' },
  'rules:update': { merchantKey: 'uber eats', categoryId: 'dining' },
  'rules:delete': { merchantKey: 'uber eats' },
  'overrides:clear': { kind: 'merchant_name', target: 'uber eats' },
  'categorization:rerun': { scope: 'unresolved' },
  'import:preview': { fileName: 'a.csv', text: 'x' },
  'import:commit': { fileName: 'a.csv', text: 'x', accountMap: [], categoryMap: [] },
  'recurring:decide': { merchantKey: 'netflix', amountMinor: -1599, decision: 'recurring' },
  'review:queue': {},
  'review:recategorize': { transactionIds: ['t'], categoryId: 'c' },
  'review:applyRetroactive': { merchantKey: 'm', categoryId: 'c' },
  'review:dismissFlag': { transactionIds: ['t'] },
  'categories:create': { name: 'New' },
  'categories:rename': { id: 'c', name: 'New' },
  'categories:merge': { sourceId: 'a', targetId: 'b' },
  'categories:setHidden': { id: 'c', hidden: true },
  'categories:delete': { id: 'c' },
  'merchants:rename': { merchantKey: 'm', displayName: 'X' },
  'recurring:acknowledge': { id: 'r' },
  'recurring:markNotRecurring': { id: 'r' },
  'alerts:dismiss': { alertId: 'a' },
  'alertRules:update': { id: 'r' },
  'alertRules:create': { type: 'large_purchase', thresholdMinor: 20000 },
  'alertRules:delete': { id: 'r' },
  'reports:get': { reportId: 'rep' },
  'reports:generate': { type: 'monthly_report' },
  'reports:delete': { id: 'rep' },
  'reports:exportPdf': { id: 'rep' },
  'diagnostics:export': { destPath: '/tmp/x' },
  'settings:update': { confidenceThreshold: 0.8 },
  'data:export': { destPath: '/tmp/x', passphrase: 'correct horse' },
  'data:import': { srcPath: '/tmp/x', passphrase: 'correct horse' },
  'data:deleteAll': { confirmation: 'DELETE ALL MY DATA' },
  'usage:view': { route: 'dashboard' },
  'usage:action': { feature: 'ui:search' },
  'usage:summary': { days: 7 },
};

describe('IPC wiring matches the contract', () => {
  const registry = new IpcRegistry();
  registerHandlers(registry, stubServices());
  const registered = new Set(registry.channels());

  it('registers every channel the contract documents', () => {
    const missing = CONTRACT_CHANNELS.filter((c) => !registered.has(c));
    expect(missing, `unregistered channels: ${missing.join(', ')}`).toEqual([]);
  });

  it('registers nothing the contract does not document', () => {
    const extra = [...registered].filter((c) => !CONTRACT_CHANNELS.includes(c));
    expect(extra, `undocumented channels: ${extra.join(', ')}`).toEqual([]);
  });

  it('every registered channel routes to its service without error', async () => {
    const failures: string[] = [];
    for (const channel of CONTRACT_CHANNELS) {
      try {
        await registry.invoke(channel, CHANNEL_PAYLOADS[channel] ?? {});
      } catch (e) {
        failures.push(`${channel}: ${(e as { code?: string }).code ?? 'error'}`);
      }
    }
    expect(failures, `channels failed to route:\n${failures.join('\n')}`).toEqual([]);
  });

  it('routes a read channel to its service', async () => {
    const result = (await registry.invoke('dashboard:get', {
      periodStart: '2026-08-01',
      periodEnd: '2026-09-01',
    })) as { called: string };
    expect(result.called).toBe('dashboard');
  });

  it('validates payloads before reaching the service', async () => {
    await expect(registry.invoke('review:recategorize', { transactionIds: [] })).rejects.toMatchObject(
      { code: 'VALIDATION_FAILED' },
    );
  });

  it('requires the exact confirmation phrase before deleting everything', async () => {
    await expect(registry.invoke('data:deleteAll', { confirmation: 'yes' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});

describe('offline behaviour of the wired registry', () => {
  it('sync:now fails honestly when offline rather than pretending to succeed', async () => {
    const registry = new IpcRegistry();
    registerHandlers(registry, stubServices({ isOnline: () => false }));
    await expect(registry.invoke('sync:now', {})).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
    });
  });

  it('a read still succeeds when the live path is unavailable', async () => {
    const registry = new IpcRegistry();
    registerHandlers(
      registry,
      stubServices({
        breakdownByCategory: async () => {
          const { IpcFailure } = await import('@main/ipc/registry');
          throw new IpcFailure('NETWORK_UNAVAILABLE', 'offline', true);
        },
      }),
    );
    const r = (await registry.invoke('breakdown:byCategory', {
      periodStart: '2026-08-01',
      periodEnd: '2026-09-01',
    })) as { dataComplete: boolean };
    expect(r.dataComplete).toBe(true);
  });
});
