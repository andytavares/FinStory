import { useEffect, useState } from 'react';
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
import { useNavigation } from './lib/navigation';
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

  // Standard back/forward chords, plus the mouse buttons some pointers have.
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

  // Hold the frame until setup status resolves. Rendering the shell first and
  // swapping to Setup a moment later flashes a UI the user cannot act on.
  if (status.loading) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-[var(--color-ink-faint)]">
        Opening your data…
      </div>
    );
  }

  // First run: there is nothing to show until an account is connected, so the
  // setup screen is the app rather than a banner on an empty dashboard.
  if (status.data && !status.data.plaidConfigured && !setupDismissed) {
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

  const drill = (categoryId: string): void => {
    nav.navigate({ view: 'register', categoryId });
  };

  const route = nav.current;
  const crumb = [LABELS.get(view) ?? '', route.categoryId].filter(Boolean).join(' · ');

  return (
    <AppShell
      groups={NAV_GROUPS}
      view={view}
      crumb={crumb}
      history={nav}
      onSelect={setView}
      onSearch={(search) => nav.navigate({ view: 'register', search })}
    >
      {view === 'dashboard' && (
        <Dashboard onDrill={drill} onReconnect={() => setView('accounts')} />
      )}
      {view === 'register' && (
        <Register
          key={`${route.categoryId ?? 'all'}-${route.merchantKey ?? ''}-${route.search ?? ''}`}
          initialCategoryId={route.categoryId ?? null}
          initialMerchantKey={route.search ?? route.merchantKey ?? null}
        />
      )}
      {view === 'recurring' && (
        <Recurring
          onOpenMerchant={(merchantKey) => nav.navigate({ view: 'register', merchantKey })}
        />
      )}
      {view === 'income' && (
        <Income onOpenMerchant={(merchantKey) => nav.navigate({ view: 'register', merchantKey })} />
      )}
      {view === 'review' && <Review />}
      {view === 'alerts' && (
        <Alerts onOpenMerchant={(search) => nav.navigate({ view: 'register', search })} />
      )}
      {view === 'reports' && (
        <Reports
          openReportId={route.reportId ?? null}
          onOpenReport={(reportId) => nav.navigate({ view: 'reports', reportId })}
          onCloseReport={nav.back}
        />
      )}
      {view === 'usage' && <Usage />}
      {view === 'import' && <Import onViewTransactions={() => nav.navigate({ view: 'register' })} />}
      {view === 'health' && <Health />}
      {view === 'overrides' && <Overrides />}
      {view === 'categories' && <Categories />}
      {view === 'accounts' && <Accounts />}
      {view === 'settings' && <Settings />}
      {import.meta.env.DEV && view === 'design' && <DesignSystem />}
    </AppShell>
  );
}
