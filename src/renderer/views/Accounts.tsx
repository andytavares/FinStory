import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { EmptyState } from '../components/EmptyState';
import { relativeAge } from '../lib/format';
import { Money } from '../components/Money';
import type { InstitutionSummary } from '@shared/types';

type LinkState = 'idle' | 'opening' | 'waiting' | 'importing' | 'done';

/** FR-001: connect accounts. Hosted Link opens in the browser (research.md R1). */
export function Accounts(): React.JSX.Element {
  const institutions = useQuery<InstitutionSummary[]>('institutions:list');
  const [state, setState] = useState<LinkState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<{ text: string; bad: boolean } | null>(null);

  const sync = async (): Promise<void> => {
    setSyncing(true);
    setSyncNote(null);
    try {
      const result = await call<{ message: string; warning: string | null }>('sync:now');
      setSyncNote({
        text: result.warning ? `${result.message} ${result.warning}` : result.message,
        bad: result.warning !== null,
      });
      institutions.refetch();
    } catch (e) {
      setSyncNote({ text: (e as { message?: string }).message ?? 'Sync failed', bad: true });
    } finally {
      setSyncing(false);
    }
  };

  const connect = async (): Promise<void> => {
    setError(null);
    setState('opening');
    try {
      const session = await call<{ hostedLinkUrl: string; linkToken: string }>('link:start');
      window.open(session.hostedLinkUrl, '_blank');
      setState('waiting');

      // Poll until the user finishes in the browser. `pending` is not an error.
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((r) => setTimeout(r, 3000));
        const result = await call<{ pending?: boolean; accountsAdded?: number }>('link:complete', {
          linkToken: session.linkToken,
        });
        if (result.pending) continue;
        setState('importing');
        setAdded(result.accountsAdded ?? 0);
        setState('done');
        return;
      }
      setError('Timed out waiting for the connection to finish.');
      setState('idle');
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not start the connection');
      setState('idle');
    }
  };

  const busy = state === 'opening' || state === 'waiting' || state === 'importing';

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[20px]">Accounts</h1>
        <button
          type="button"
          disabled={busy}
          onClick={() => void connect()}
          className="btn"
        >
          {busy ? 'Connecting…' : 'Connect an account'}
        </button>
      </div>

      {state === 'waiting' && (
        <p className="border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-[13px]">
          Finish signing in to your bank in the browser window. This screen updates on its own when
          you are done.
        </p>
      )}
      {state === 'importing' && (
        <p className="text-[13px] text-[var(--color-ink-muted)]">Importing your history…</p>
      )}
      {state === 'done' && added !== null && (
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          Connected. {added} account{added === 1 ? '' : 's'} added and your history is importing in
          the background.
        </p>
      )}
      {error && <p className="text-[13px] text-[var(--color-attention)]">{error}</p>}

      {institutions.data && institutions.data.length === 0 && state === 'idle' && (
        <EmptyState
          title="No accounts connected yet"
          detail="Connect a bank, card, or payment app and Money imports your history automatically. You will never enter a transaction by hand."
        />
      )}

      {institutions.data && institutions.data.length > 0 && (
        <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
          {institutions.data.map((i) => (
            <li key={i.id}>
              <div className="flex items-center gap-4 bg-[var(--color-surface)] px-4 py-3">
                <div className="flex-1">
                  <p className="text-[13px]">{i.institutionName}</p>
                  <p className="text-[12px] text-[var(--color-ink-faint)]">
                    {i.accountCount} account{i.accountCount === 1 ? '' : 's'} · synced{' '}
                    {relativeAge(i.lastSyncedAt)}
                  </p>
                </div>
                {i.status !== 'healthy' && (
                  <button
                    type="button"
                    onClick={() => void call('institutions:reauth', { institutionId: i.id })}
                    className="btn text-[var(--color-attention)]"
                  >
                    Reconnect
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void call('institutions:disconnect', { institutionId: i.id }).then(
                      institutions.refetch,
                    );
                  }}
                  className="btn"
                >
                  Disconnect
                </button>
              </div>

              {/* Each account individually, with its own balance and whether it
                  counts as day-to-day money. */}
              {i.accounts.map((a) => (
                <div
                  key={a.id}
                  className={`flex items-center gap-4 border-t border-[var(--color-line)] bg-[var(--color-ground)] px-4 py-2 pl-8 text-[13px] ${
                    a.isEveryday ? '' : 'opacity-60'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {a.name}
                      {a.mask && (
                        <span className="numeric ml-2 text-[12px] text-[var(--color-ink-faint)]">
                          ••{a.mask}
                        </span>
                      )}
                    </p>
                    <p className="text-[12px] text-[var(--color-ink-faint)]">
                      {a.subtype ?? a.type}
                      {a.balanceAsOf ? ` · as of ${relativeAge(a.balanceAsOf)}` : ''}
                    </p>
                  </div>
                  {a.currentBalanceMinor === null ? (
                    <span className="text-[12px] text-[var(--color-ink-faint)]">
                      balance unknown
                    </span>
                  ) : (
                    <Money minor={a.currentBalanceMinor} />
                  )}
                  <label className="flex items-center gap-2 text-[12px] text-[var(--color-ink-faint)]">
                    <input
                      type="checkbox"
                      checked={a.isEveryday}
                      onChange={(e) => {
                        void call('accounts:setEveryday', {
                          accountId: a.id,
                          isEveryday: e.target.checked,
                        }).then(institutions.refetch);
                      }}
                      aria-label={`Include ${a.name} in day-to-day spending`}
                    />
                    Day-to-day
                  </label>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[12px] text-[var(--color-ink-faint)]">
        Accounts marked day-to-day count toward spending totals and the runway. Turn it off for
        savings and investments — money you are not spending from should not make those numbers
        look bigger than they are.
      </p>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void sync()}
          disabled={syncing}
          className="btn self-start"
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
        {syncNote && (
          <p
            role="status"
            className={`text-[12px] ${syncNote.bad ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-faint)]'}`}
          >
            {syncNote.text}
          </p>
        )}
      </div>
    </div>
  );
}
