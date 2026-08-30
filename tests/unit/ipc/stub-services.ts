import type { AppServices } from '@main/ipc/handlers/services';

/** Every service method resolves to a marker naming itself, so wiring is checkable. */
export function stubServices(overrides: Partial<AppServices> = {}): AppServices {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop in overrides) return (overrides as Record<string, unknown>)[prop];
      if (prop === 'isOnline') return () => true;
      if (prop === 'completeness')
        return async () => ({ dataComplete: true, staleInstitutions: [] });
      return async () => ({ called: prop });
    },
  };
  return new Proxy({}, handler) as unknown as AppServices;
}
