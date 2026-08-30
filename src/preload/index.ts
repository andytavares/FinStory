import { contextBridge, ipcRenderer } from 'electron';

/**
 * The ONLY path between renderer and main.
 *
 * Channels are enumerated explicitly: an allowlist, not a passthrough. A
 * generic `invoke(channel, payload)` bridge would let a compromised renderer
 * reach any handler, which is exactly what contextIsolation exists to prevent.
 */

export const INVOKE_CHANNELS = [
  'setup:status',
  'setup:saveCredentials',
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
  'trends:overTime',
  'income:list',
  'income:confirm',
  'income:override',
  'income:add',
  'income:clearOverride',
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
  'health:get',
  'diagnostics:export',
  'settings:get',
  'models:listOllama',
  'settings:update',
  'data:export',
  'data:import',
  'data:deleteAll',
  'analysis:refresh',
  'sync:now',
  'model:status',
  'model:test',
  'categorization:rerun',
  'overrides:list',
  'overrides:clear',
] as const;

const EVENT_CHANNELS = [
  'sync:progress',
  'sync:complete',
  'alert:fired',
  'catchup:summary',
  'institution:statusChanged',
  'health:degraded',
  'income:patternChanged',
] as const;

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number];
export type EventChannel = (typeof EVENT_CHANNELS)[number];

const api = {
  invoke(channel: InvokeChannel, payload?: unknown): Promise<unknown> {
    if (!INVOKE_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`Channel not permitted: ${channel}`));
    }
    return ipcRenderer.invoke(channel, payload ?? {});
  },
  on(channel: EventChannel, listener: (payload: unknown) => void): () => void {
    if (!EVENT_CHANNELS.includes(channel)) {
      throw new Error(`Event channel not permitted: ${channel}`);
    }
    const wrapped = (_e: unknown, payload: unknown): void => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld('money', api);

export type MoneyApi = typeof api;
