/** Stub the preload bridge so renderer tests exercise components, not IPC. */
const listeners = new Map<string, (payload: unknown) => void>();

/** Fire an event the way the main process would, for progress and alerts. */
export function emitToRenderer(channel: string, payload: unknown): void {
  listeners.get(channel)?.(payload);
}

export function installMoneyBridge(responses: Record<string, unknown>): void {
  listeners.clear();
  (globalThis as { window?: unknown }).window = globalThis.window ?? {};
  Object.defineProperty(globalThis.window, 'money', {
    configurable: true,
    value: {
      invoke: (channel: string) =>
        channel in responses
          ? Promise.resolve(responses[channel])
          : Promise.reject(new Error(`No stub for ${channel}`)),
      on: (channel: string, listener: (payload: unknown) => void) => {
        listeners.set(channel, listener);
        return () => listeners.delete(channel);
      },
    },
  });
}
