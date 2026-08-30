import { useState } from 'react';
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
import { Alerts } from './views/Alerts';
import { Setup } from './views/Setup';
import { useQuery } from './lib/ipc';
import type { SetupStatus } from '@shared/types';

type ViewId =
  | 'dashboard'
  | 'register'
  | 'recurring'
  | 'income'
  | 'review'
  | 'alerts'
  | 'reports'
  | 'health'
  | 'categories'
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
  { id: 'categories', label: 'Categories', Icon: Tags },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export function App(): React.JSX.Element {
  const [view, setView] = useState<ViewId>('dashboard');
  const [drillCategoryId, setDrillCategoryId] = useState<string | null>(null);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const status = useQuery<SetupStatus>('setup:status');

  // First run: there is nothing to show until an account is connected, so the
  // setup screen is the app rather than a banner on an empty dashboard.
  if (status.data && !status.data.plaidConfigured && !setupDismissed) {
    return <Setup status={status.data} onComplete={() => setSetupDismissed(true)} />;
  }

  const drill = (categoryId: string): void => {
    setDrillCategoryId(categoryId);
    setView('register');
  };

  return (
    <div className="flex h-full">
      <nav className="flex w-52 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface)] pt-10">
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

      <main className="flex-1 overflow-y-auto px-8 py-10">
        <div className="mx-auto max-w-4xl">
          {view === 'dashboard' && <Dashboard onDrill={drill} />}
          {view === 'register' && <Register initialCategoryId={drillCategoryId} />}
          {view === 'recurring' && <Recurring />}
          {view === 'income' && <Income />}
          {view === 'review' && <Review />}
          {view === 'alerts' && <Alerts />}
          {view === 'reports' && <Reports />}
          {view === 'health' && <Health />}
          {view === 'categories' && <Categories />}
          {view === 'settings' && <Settings />}
        </div>
      </main>
    </div>
  );
}
