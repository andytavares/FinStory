import { describe, it, expect, vi } from 'vitest';

// The preload runs in Electron; only the two objects it touches are needed here.
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: () => {} },
  ipcRenderer: { invoke: () => Promise.resolve(), on: () => {}, removeListener: () => {} },
}));

const { INVOKE_CHANNELS } = await import('@preload/index');
const { IpcRegistry } = await import('@main/ipc/registry');
const { registerHandlers } = await import('@main/ipc/handlers/index');
const { stubServices } = await import('./stub-services');

/**
 * The preload allowlist is a third list that has to agree with the handlers and
 * the contract. Adding a channel to the main process and forgetting the preload
 * produces "Channel not permitted" at runtime and nowhere earlier — the tests,
 * the type checker and the build all stay green.
 */
describe('the preload allowlist matches the registered handlers', () => {
  const registry = new IpcRegistry();
  registerHandlers(registry, stubServices());
  const registered = [...registry.channels()];
  const allowed = [...INVOKE_CHANNELS] as string[];

  it('permits every channel the main process registers', () => {
    const missing = registered.filter((c) => !allowed.includes(c));
    expect(missing, `channels the renderer cannot reach: ${missing.join(', ')}`).toEqual([]);
  });

  it('permits nothing the main process does not handle', () => {
    const extra = allowed.filter((c) => !registered.includes(c));
    expect(extra, `allowlisted but unhandled: ${extra.join(', ')}`).toEqual([]);
  });
});
