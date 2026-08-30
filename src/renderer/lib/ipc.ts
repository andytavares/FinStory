import { useEffect, useState } from 'react';

/** Thin typed wrapper over the preload bridge. */
export async function call<T>(channel: string, payload?: unknown): Promise<T> {
  return window.money.invoke(channel as never, payload) as Promise<T>;
}

export interface Query<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly loading: boolean;
}

/** Load once on mount. Reads are offline-safe by contract, so this rarely errors. */
export function useQuery<T>(channel: string, payload?: unknown): Query<T> {
  const [state, setState] = useState<Query<T>>({ data: null, error: null, loading: true });
  const key = JSON.stringify(payload ?? {});

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    call<T>(channel, JSON.parse(key) as unknown)
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((e: { message?: string }) => {
        if (!cancelled) setState({ data: null, error: e.message ?? 'Something went wrong', loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [channel, key]);

  return state;
}
