import { useEffect, useState } from 'react';
import { UpdateToast } from './components/UpdateToast';
import { Dashboard } from './views/Dashboard';
import { Register } from './views/Register';
import { Recurring } from './views/Recurring';
import { Income } from './views/Income';
import { Review } from './views/Review';
import { Reports } from './views/Reports';
import { Health } from './views/Health';
import { Settings } from './views/Settings';
import { Categories } from './views/Categories';
import { Overrides } from './views/Overrides';
import { Alerts } from './views/Alerts';
import { Setup } from './views/Setup';
import { Accounts } from './views/Accounts';
import { Usage } from './views/Usage';
import { Import } from './views/Import';
import { call, useQuery } from './lib/ipc';
import type { ViewId } from '@shared/features';
import type { SetupStatus } from '@shared/types';
import { useNavigation, type Navigation } from './lib/navigation';
import { AppShell, type NavGroup } from './components/AppShell';
import { DesignSystem } from './views/DesignSystem';

const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dash' },
      { id: 'register', label: 'Transactions', icon: 'tx' },
      { id: 'recurring', label: 'Recurring', icon: 'rec' },
      { id: 'income', label: 'Income', icon: 'inc' },
    ],
  },
  {
    title: 'To do',
    items: [
      { id: 'review', label: 'Review', icon: 'rev' },
      { id: 'alerts', label: 'Alerts', icon: 'bell' },
    ],
  },
  {
    title: 'Insights',
    items: [
      { id: 'reports', label: 'Reports', icon: 'rep' },
      { id: 'usage', label: 'Usage', icon: 'use' },
    ],
  },
  {
    title: 'Manage',
    items: [
      { id: 'categories', label: 'Categories', icon: 'cat' },
      { id: 'overrides', label: 'Rules', icon: 'rule' },
      { id: 'accounts', label: 'Accounts', icon: 'acct' },
      { id: 'import', label: 'Import', icon: 'imp' },
    ],
  },
  {
    title: 'System',
    items: [
      { id: 'health', label: 'Health', icon: 'health' },
      { id: 'settings', label: 'Settings', icon: 'gear' },
    ],
  },
  ...(import.meta.env.DEV
    ? [{ title: 'Dev', items: [{ id: 'design', label: 'Design system', icon: 'design' }] } as const]
    : []),
];

const LABELS = new Map(NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.id, i.label] as const)));

interface ViewContext {
  readonly nav: Navigation;
  readonly setView: (view: string) => void;
}

const VIEWS: Record<ViewId, (context: ViewContext) => React.JSX.Element> = {
  dashboard: ({ nav, setView }) => (
    <Dashboard
      onDrill={(categoryId) => nav.navigate({ view: 'register', categoryId })}
      onReconnect={() => setView('accounts')}
    />
  ),
  register: ({ nav }) => {
    const route = nav.current;
    return (
      <Register
        key={`${route.categoryId ?? 'all'}-${route.merchantKey ?? ''}-${route.search ?? ''}`}
        initialCategoryId={route.categoryId ?? null}
        initialMerchantKey={route.search ?? route.merchantKey ?? null}
      />
    );
  },
  recurring: ({ nav }) => (
    <Recurring onOpenMerchant={(merchantKey) => nav.navigate({ view: 'register', merchantKey })} />
  ),
  income: ({ nav }) => (
    <Income onOpenMerchant={(merchantKey) => nav.navigate({ view: 'register', merchantKey })} />
  ),
  review: () => <Review />,
  alerts: ({ nav }) => (
    <Alerts onOpenMerchant={(search) => nav.navigate({ view: 'register', search })} />
  ),
  reports: ({ nav }) => (
    <Reports
      openReportId={nav.current.reportId ?? null}
      onOpenReport={(reportId) => nav.navigate({ view: 'reports', reportId })}
      onCloseReport={nav.back}
    />
  ),
  usage: () => <Usage />,
  import: ({ nav }) => <Import onViewTransactions={() => nav.navigate({ view: 'register' })} />,
  health: () => <Health />,
  overrides: () => <Overrides />,
  categories: () => <Categories />,
  accounts: () => <Accounts />,
  settings: () => <Settings />,
  design: () => (import.meta.env.DEV ? <DesignSystem /> : <></>),
};

/** Standard back/forward chords, plus the mouse buttons some pointers have. */
function useHistoryKeys(nav: Navigation): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.altKey)) return;
      if (e.key === '[' || e.key === 'ArrowLeft') {
        e.preventDefault();
        nav.back();
      } else if (e.key === ']' || e.key === 'ArrowRight') {
        e.preventDefault();
        nav.forward();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);
}

export function App(): React.JSX.Element {
  const nav = useNavigation({ view: 'dashboard' });
  const [setupDismissed, setSetupDismissed] = useState(false);
  const status = useQuery<SetupStatus>('setup:status');

  const view = nav.current.view as ViewId;
  const setView = (next: string): void => nav.navigate({ view: next });

  // Every arrival on a screen, including the first and back/forward, is one usage event.
  useEffect(() => {
    void call('usage:view', { route: view }).catch(() => {});
  }, [view]);

  useHistoryKeys(nav);

  // Hold the frame until setup status resolves. Rendering the shell first and
  // swapping to Setup a moment later flashes a UI the user cannot act on.
  if (status.loading) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-[var(--color-ink-faint)]">
        Opening your data…
      </div>
    );
  }

  // First run: nothing to show until Plaid is set up or an account exists, so
  // the setup screen is the app. Accounts made by hand mean Plaid was skipped.
  if (status.data && !status.data.plaidConfigured && status.data.accountCount === 0 && !setupDismissed) {
    return (
      <Setup
        status={status.data}
        onComplete={() => {
          setSetupDismissed(true);
          setView('accounts');
        }}
      />
    );
  }

  const crumb = [LABELS.get(view) ?? '', nav.current.categoryId].filter(Boolean).join(' · ');

  return (
    <>
      <AppShell
        sidebar={{ groups: NAV_GROUPS, view, onSelect: setView }}
        topBar={{
          crumb,
          history: nav,
          onSearch: (search) => nav.navigate({ view: 'register', search }),
        }}
      >
        {(VIEWS as Partial<typeof VIEWS>)[view]?.({ nav, setView }) ?? null}
      </AppShell>
      <UpdateToast />
    </>
  );
}
