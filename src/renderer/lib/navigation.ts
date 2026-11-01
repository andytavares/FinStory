import { useCallback, useMemo, useState } from 'react';

/** A place in the app, including any drill-down parameters. */
export interface Route {
  readonly view: string;
  readonly categoryId?: string;
  readonly reportId?: string;
  readonly merchantKey?: string;
  /** Free text from the top-bar search, applied by the Transactions view. */
  readonly search?: string;
  readonly direction?: 'all' | 'in' | 'out';
}

export interface Navigation {
  readonly current: Route;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  /** Push a new entry, discarding anything ahead — standard browser semantics. */
  navigate: (route: Route) => void;
  /** Change the current entry without adding history (e.g. a filter toggle). */
  replace: (route: Route) => void;
  back: () => void;
  forward: () => void;
}

function sameRoute(a: Route, b: Route): boolean {
  return (
    a.view === b.view &&
    a.categoryId === b.categoryId &&
    a.reportId === b.reportId &&
    a.merchantKey === b.merchantKey &&
    a.search === b.search &&
    a.direction === b.direction
  );
}

/**
 * Browser-style history for a single-window app.
 *
 * Drilling from a category into its transactions is a navigation, so it needs a
 * way back. Without this the only route out of a drill-down is re-picking the
 * view from the sidebar, which loses where you came from.
 */
export function useNavigation(initial: Route): Navigation {
  const [entries, setEntries] = useState<Route[]>([initial]);
  const [index, setIndex] = useState(0);

  const navigate = useCallback(
    (route: Route) => {
      setEntries((prev) => {
        const current = prev[index];
        // Re-navigating to where you already are should not stack duplicates.
        if (current && sameRoute(current, route)) return prev;
        const truncated = prev.slice(0, index + 1);
        return [...truncated, route];
      });
      setIndex((i) => {
        const current = entries[i];
        return current && sameRoute(current, route) ? i : i + 1;
      });
    },
    [entries, index],
  );

  const replace = useCallback(
    (route: Route) => {
      setEntries((prev) => prev.map((entry, i) => (i === index ? route : entry)));
    },
    [index],
  );

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const forward = useCallback(
    () => setIndex((i) => Math.min(entries.length - 1, i + 1)),
    [entries.length],
  );

  return useMemo(
    () => ({
      current: entries[index] ?? initial,
      canGoBack: index > 0,
      canGoForward: index < entries.length - 1,
      navigate,
      replace,
      back,
      forward,
    }),
    [entries, index, initial, navigate, replace, back, forward],
  );
}
