import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Receipt,
  RefreshCw,
  Wallet,
  Inbox,
  FileText,
  Activity,
  Settings as SettingsIcon,
  Tags,
  Bell,
  Landmark,
  Undo2,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
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
import { useQuery } from './lib/ipc';
import type { SetupStatus } from '@shared/types';
import { useNavigation } from './lib/navigation';

type ViewId =
  | 'dashboard'
  | 'register'
  | 'recurring'
  | 'income'
  | 'review'
  | 'alerts'
  | 'reports'
  | 'health'
  | 'overrides'
  | 'categories'
  | 'accounts'
  | 'settings';

const NAV: ReadonlyArray<{ id: ViewId; label: string; Icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'register', label: 'Transactions', Icon: Receipt },
  { id: 'recurring', label: 'Recurring', Icon: RefreshCw },
  { id: 'income', label: 'Income', Icon: Wallet },
  { id: 'review', label: 'Review', Icon: Inbox },
  { id: 'alerts', label: 'Alerts', Icon: Bell },
  { id: 'reports', label: 'Reports', Icon: FileText },
  { id: 'health', label: 'Health', Icon: Activity },
  { id: 'overrides', label: 'Overrides', Icon: Undo2 },
  { id: 'categories', label: 'Categories', Icon: Tags },
  { id: 'accounts', label: 'Accounts', Icon: Landmark },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export function App(): React.JSX.Element {
  const nav = useNavigation({ view: 'dashboard' });
  const [setupDismissed, setSetupDismissed] = useState(false);
  const status = useQuery<SetupStatus>('setup:status');

  const view = nav.current.view as ViewId;
  const setView = (next: ViewId): void => nav.navigate({ view: next });

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

  return (
    <div className="flex h-full overflow-hidden">
      <nav className="flex w-52 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-[var(--color-line)] bg-[var(--color-surface)] pt-10">
        <p className="px-5 pb-4 text-[13px] tracking-[0.2em] text-[var(--color-ink-faint)]">MONEY</p>
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`icon flex items-center gap-3 px-5 py-2 text-left text-[13px] ${
              view === id
                ? 'text-[var(--color-ink)]'
                : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]'
            }`}
          >
            <Icon aria-hidden className={view === id ? '' : 'opacity-70'} />
            {label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto overscroll-contain">
        {/* History controls: a drill-down is a navigation, so it needs a way back. */}
        <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-[var(--color-line)] bg-[var(--color-ground)] px-8 py-2">
          <button
            type="button"
            onClick={nav.back}
            disabled={!nav.canGoBack}
            aria-label="Back"
            title="Back (⌘[)"
            className="icon p-1 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] disabled:opacity-30"
          >
            <ArrowLeft aria-hidden />
          </button>
          <button
            type="button"
            onClick={nav.forward}
            disabled={!nav.canGoForward}
            aria-label="Forward"
            title="Forward (⌘])"
            className="icon p-1 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] disabled:opacity-30"
          >
            <ArrowRight aria-hidden />
          </button>
          <span className="ml-2 text-[12px] text-[var(--color-ink-faint)]">
            {NAV.find((n) => n.id === view)?.label ?? ''}
            {nav.current.categoryId ? ` · ${nav.current.categoryId}` : ''}
          </span>
        </div>

        <div className="mx-auto max-w-4xl px-8 py-10">
          {view === 'dashboard' && <Dashboard onDrill={drill} />}
          {view === 'register' && (
            <Register
              key={`${nav.current.categoryId ?? 'all'}-${nav.current.merchantKey ?? ''}`}
              initialCategoryId={nav.current.categoryId ?? null}
              initialMerchantKey={nav.current.merchantKey ?? null}
            />
          )}
          {view === 'recurring' && (
            <Recurring
              onOpenMerchant={(merchantKey) => nav.navigate({ view: 'register', merchantKey })}
            />
          )}
          {view === 'income' && (
            <Income
              onOpenMerchant={(merchantKey) => nav.navigate({ view: 'register', merchantKey })}
            />
          )}
          {view === 'review' && <Review />}
          {view === 'alerts' && <Alerts />}
          {view === 'reports' && (
            <Reports
              openReportId={nav.current.reportId ?? null}
              onOpenReport={(reportId) => nav.navigate({ view: 'reports', reportId })}
              onCloseReport={nav.back}
            />
          )}
          {view === 'health' && <Health />}
          {view === 'overrides' && <Overrides />}
          {view === 'categories' && <Categories />}
          {view === 'accounts' && <Accounts />}
          {view === 'settings' && <Settings />}
        </div>
      </main>
    </div>
  );
}
