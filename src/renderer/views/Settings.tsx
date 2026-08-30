import { useQuery, call } from '../lib/ipc';
import type { AppSettings, SetupStatus } from '@shared/types';

/** FR-061: the disclosure lives here, and the switch that governs it. */
export function Settings(): React.JSX.Element {
  const settings = useQuery<AppSettings>('settings:get');
  const status = useQuery<SetupStatus>('setup:status');

  if (settings.loading || !settings.data) {
    return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  }
  const s = settings.data;

  return (
    <div className="space-y-8">
      <h1 className="text-[20px]">Settings</h1>

      <section className="space-y-3">
        <p className="eyebrow">Categorization</p>
        <label className="flex items-center justify-between border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-[13px]">
          <span>
            Use Claude for merchants your history cannot resolve
            <span className="mt-1 block text-[12px] text-[var(--color-ink-faint)]">
              Sends the merchant name, amount, date, and your category history for that one
              merchant. Never account numbers, balances, credentials, or totals. Turn this off to
              keep everything on this machine, at the cost of more transactions needing review.
            </span>
          </span>
          <input
            type="checkbox"
            checked={s.categorizationMode === 'hybrid'}
            onChange={(e) =>
              void call('settings:update', {
                categorizationMode: e.target.checked ? 'hybrid' : 'local_only',
              })
            }
          />
        </label>
      </section>

      <section className="space-y-3">
        <p className="eyebrow">Sync</p>
        <label className="flex items-center justify-between border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-[13px]">
          <span>
            Check for new transactions every
            <span className="mt-1 block text-[12px] text-[var(--color-ink-faint)]">
              Alerts arrive within one interval while the app is running, and everything missed is
              delivered on next launch.
            </span>
          </span>
          <span className="numeric">{s.pollIntervalMinutes} min</span>
        </label>
      </section>

      <section className="space-y-3">
        <p className="eyebrow">Your data</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void call('data:export', { destPath: '' })}
            className="border border-[var(--color-line)] px-3 py-2 text-[13px] hover:bg-[var(--color-surface-raised)]"
          >
            Back up
          </button>
          <button
            type="button"
            onClick={() => void call('data:import', { srcPath: '' })}
            className="border border-[var(--color-line)] px-3 py-2 text-[13px] hover:bg-[var(--color-surface-raised)]"
          >
            Restore
          </button>
        </div>
        <p className="text-[12px] text-[var(--color-ink-faint)]">
          Everything lives on this machine. There is no copy anywhere else, so a backup is the only
          way to recover from a lost disk.
        </p>
      </section>

      {status.data && (
        <section className="space-y-1 text-[12px] text-[var(--color-ink-faint)]">
          <p className="eyebrow">Connections</p>
          <p>{status.data.accountCount} accounts connected</p>
          <p>Plaid {status.data.plaidConfigured ? 'configured' : 'not configured'}</p>
        </section>
      )}
    </div>
  );
}
