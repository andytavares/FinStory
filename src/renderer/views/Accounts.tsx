import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { EmptyState } from '../components/EmptyState';
import { money } from '../lib/format';
import { Button, Card, PageHeader } from '../components/ui';
import { BankCard } from './accounts/BankCard';
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
  const list = institutions.data;
  const accountCount = list?.reduce((n, i) => n + i.accounts.length, 0) ?? 0;
  const netMinor = list?.reduce(
    (sum, i) => sum + i.accounts.reduce((s, a) => s + (a.currentBalanceMinor ?? 0), 0),
    0,
  );

  const summary =
    list && list.length > 0
      ? `Net ${money(netMinor ?? 0)} across ${accountCount} account${accountCount === 1 ? '' : 's'}`
      : null;

  return (
    <>
      <PageHeader
        title="Accounts"
        {...(summary ? { sub: summary } : {})}
        actions={
          <>
            <Button disabled={syncing} onClick={() => void sync()}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void connect()}>
              {busy ? 'Connecting…' : 'Connect an account'}
            </Button>
          </>
        }
      />

      {syncNote && (
        <p role="status" className={`text-[12px] ${syncNote.bad ? 'ds-muted' : 'ds-faint'}`}>
          {syncNote.text}
        </p>
      )}
      {state === 'waiting' && (
        <Card>
          Finish signing in to your bank in the browser window. This screen updates on its own when
          you are done.
        </Card>
      )}
      {state === 'importing' && <p className="ds-muted">Importing your history…</p>}
      {state === 'done' && added !== null && (
        <p className="ds-muted">
          Connected. {added} account{added === 1 ? '' : 's'} added and your history is importing in
          the background.
        </p>
      )}
      {error && <p className="ds-warn">{error}</p>}

      {list && list.length === 0 && state === 'idle' && (
        <EmptyState
          title="No accounts connected yet"
          detail="Connect a bank, card, or payment app and Money imports your history automatically. You will never enter a transaction by hand."
        />
      )}

      {list && list.length > 0 && (
        <div className="ds-grid grid-cols-2">
          {list.map((institution) => (
            <BankCard key={institution.id} institution={institution} onChanged={institutions.refetch} />
          ))}
        </div>
      )}

      <p className="ds-caption">
        Turn off &quot;day-to-day&quot; for savings and investments so they do not inflate runway.
      </p>
    </>
  );
}
