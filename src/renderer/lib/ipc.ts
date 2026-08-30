import { useEffect, useState } from 'react';

/** Thin typed wrapper over the preload bridge. */
export async function call<T>(channel: string, payload?: unknown): Promise<T> {
  return window.money.invoke(channel as never, payload) as Promise<T>;
}

export interface Query<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly loading: boolean;
  /** Re-run the query — call after a mutation so the view reflects the change. */
  readonly refetch: () => void;
}

/** Load on mount, and again whenever `refetch` is called. */
export function useQuery<T>(channel: string, payload?: unknown): Query<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [nonce, setNonce] = useState(0);
  const key = JSON.stringify(payload ?? {});

  useEffect(() => {
    let cancelled = false;
    // Keep the previous data on screen while refetching. Blanking the list and
    // re-rendering it scrolls the view back to the top, which loses the user's
    // place every time they toggle something.
    setState((s) => ({ ...s, loading: s.data === null }));
    call<T>(channel, JSON.parse(key) as unknown)
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((e: { message?: string }) => {
        if (!cancelled)
          setState({ data: null, error: e.message ?? 'Something went wrong', loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [channel, key, nonce]);

  return { ...state, refetch: () => setNonce((n) => n + 1) };
}
