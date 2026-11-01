import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { useQuery } from '../lib/ipc';
import { relativeAge } from '../lib/format';
import type { AlertView, HealthView } from '@shared/types';

export type NavIcon =
  | 'dash'
  | 'tx'
  | 'rec'
  | 'inc'
  | 'rev'
  | 'bell'
  | 'rep'
  | 'use'
  | 'cat'
  | 'rule'
  | 'acct'
  | 'imp'
  | 'health'
  | 'gear'
  | 'design';

/** Icon paths copied from the approved design (mock.js `I`). */
const ICON_PATHS: Record<Exclude<NavIcon, 'dash'>, string> = {
  tx: 'M4 7h16M4 12h16M4 17h10',
  rec: 'M20 11a8 8 0 0 0-14-5l-2 2M4 13a8 8 0 0 0 14 5l2-2M4 4v4h4M20 20v-4h-4',
  inc: 'M12 19V5M6 11l6-6 6 6',
  rev: 'M4 13l4 4L20 5',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4',
  rep: 'M6 3h9l4 4v14H6zM9 13h6M9 17h6M9 9h3',
  use: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  cat: 'M3 12V4h8l10 10-8 8z',
  rule: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z',
  acct: 'M3 10l9-6 9 6M5 10v8M19 10v8M9 10v8M15 10v8M3 20h18',
  imp: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  health: 'M3 12h4l3-7 4 14 3-7h4',
  gear: 'M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  design: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
};

function NavSvg({ icon }: { icon: NavIcon }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      {icon === 'dash' && (
        <>
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </>
      )}
      {icon === 'cat' && <circle cx="7.5" cy="8" r="1.2" />}
      {icon === 'gear' && <circle cx="12" cy="12" r="3" />}
      {icon !== 'dash' && <path d={ICON_PATHS[icon]} />}
    </svg>
  );
}

export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly icon: NavIcon;
}
export interface NavGroup {
  readonly title: string;
  readonly items: readonly NavItem[];
}

function useNavCounts(view: string): { review: number; alerts: number; synced: string | null } {
  const review = useQuery<{ totalCount: number }>('review:queue', { limit: 1, offset: 0 });
  const alerts = useQuery<AlertView[]>('alerts:list');
  const health = useQuery<HealthView>('health:get');
  const refetchers = useRef([review.refetch, alerts.refetch, health.refetch]);
  refetchers.current = [review.refetch, alerts.refetch, health.refetch];
  // Counts change while the user works in other views, so refresh on every move.
  useEffect(() => {
    refetchers.current.forEach((refetch) => refetch());
  }, [view]);
  const syncTimes = (health.data?.perAccount ?? [])
    .map((a) => a.lastSuccessfulSync)
    .filter((t): t is string => t !== null)
    .sort();
  return {
    review: review.data?.totalCount ?? 0,
    alerts: (alerts.data ?? []).filter((a) => !a.dismissed).length,
    synced: syncTimes.at(-1) ?? null,
  };
}

export interface SidebarProps {
  readonly groups: readonly NavGroup[];
  readonly view: string;
  readonly onSelect: (id: string) => void;
}

export function Sidebar(props: SidebarProps): React.JSX.Element {
  const { groups, view, onSelect } = props;
  const counts = useNavCounts(view);
  const badges: Record<string, { count: number; hot: boolean }> = {
    review: { count: counts.review, hot: true },
    alerts: { count: counts.alerts, hot: false },
  };
  return (
    <nav className="ds-side">
      <div className="ds-brand">
        <b>$</b>Money
      </div>
      {groups.map((group) => (
        <div key={group.title} style={{ display: 'contents' }}>
          <div className="ds-group">{group.title}</div>
          {group.items.map((item) => {
            const badge = badges[item.id];
            return (
              <button
                key={item.id}
                type="button"
                className="ds-nav"
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => onSelect(item.id)}
              >
                <NavSvg icon={item.icon} />
                {item.label}
                {badge && badge.count > 0 && (
                  <span
                    aria-hidden
                    className={`ds-badge ${badge.hot ? 'ds-badge-hot' : ''}`.trim()}
                  >
                    {badge.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
      {counts.synced && (
        <div className="ds-sync">
          <span className="ds-dot" />
          Synced {relativeAge(counts.synced)}
        </div>
      )}
    </nav>
  );
}

export interface TopBarProps {
  readonly crumb: string;
  readonly history: {
    canGoBack: boolean;
    canGoForward: boolean;
    back: () => void;
    forward: () => void;
  };
  readonly onSearch: (text: string) => void;
}

export function TopBar(props: TopBarProps): React.JSX.Element {
  const { crumb, history, onSearch } = props;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="ds-top">
      <button
        type="button"
        className="ds-history"
        onClick={history.back}
        disabled={!history.canGoBack}
        aria-label="Back"
        title="Back (⌘[)"
      >
        <ArrowLeft aria-hidden />
      </button>
      <button
        type="button"
        className="ds-history"
        onClick={history.forward}
        disabled={!history.canGoForward}
        aria-label="Forward"
        title="Forward (⌘])"
      >
        <ArrowRight aria-hidden />
      </button>
      <span className="ds-crumb">{crumb}</span>
      <div className="ds-search">
        <Search aria-hidden size={13} />
        <input
          ref={input}
          aria-label="Search everything"
          placeholder="Search merchants, amounts, notes"
          onKeyDown={(e) => {
            const text = e.currentTarget.value.trim();
            if (e.key === 'Enter' && text) onSearch(text);
          }}
        />
        <kbd>⌘K</kbd>
      </div>
    </div>
  );
}

export function AppShell({
  sidebar,
  topBar,
  children,
}: {
  sidebar: SidebarProps;
  topBar: TopBarProps;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="ds-shell">
      <Sidebar {...sidebar} />
      <main className="ds-main">
        <TopBar {...topBar} />
        <div className="ds-body">{children}</div>
      </main>
    </div>
  );
}
