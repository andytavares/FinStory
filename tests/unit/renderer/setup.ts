/** Stub the preload bridge so renderer tests exercise components, not IPC. */
export function installMoneyBridge(responses: Record<string, unknown>): void {
  (globalThis as { window?: unknown }).window = globalThis.window ?? {};
  Object.defineProperty(globalThis.window, 'money', {
    configurable: true,
    value: {
      invoke: (channel: string) =>
        channel in responses
          ? Promise.resolve(responses[channel])
          : Promise.reject(new Error(`No stub for ${channel}`)),
      on: () => () => {},
    },
  });
}
