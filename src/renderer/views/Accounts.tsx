import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { EmptyState } from '../components/EmptyState';
import { money } from '../lib/format';
import { Button, Card, PageHeader } from '../components/ui';
import { BankCard } from './accounts/BankCard';
import { AddAccount } from './accounts/AddAccount';
import type { InstitutionSummary } from '@shared/types';

interface LinkSession {
  hostedLinkUrl: string;
  linkToken: string;
}

interface LinkResult {
  pending?: boolean;
  accountsAdded?: number;
}

type LinkState = 'idle' | 'opening' | 'waiting' | 'importing' | 'done';

/** Poll until the user finishes in the browser; `pending` is not an error. Null on timeout. */
async function pollForLink(linkToken: string): Promise<number | null> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((r) => setTimeout(r, 3000));
    const result = await call<LinkResult>('link:complete', { linkToken });
    if (!result.pending) return result.accountsAdded ?? 0;
  }
  return null;
}

function messageOf(error: unknown, fallback: string): string {
  return (error as { message?: string }).message ?? fallback;
}

function netSummary(list: InstitutionSummary[] | null): string | null {
  if (!list || list.length === 0) return null;
  const accounts = list.flatMap((i) => i.accounts);
  const netMinor = accounts.reduce((sum, a) => sum + (a.currentBalanceMinor ?? 0), 0);
  return `Net ${money(netMinor)} across ${accounts.length} account${accounts.length === 1 ? '' : 's'}`;
}

/** FR-001: connect accounts. Hosted Link opens in the browser (research.md R1). */
export function Accounts(): React.JSX.Element {
  const institutions = useQuery<InstitutionSummary[]>('institutions:list');
  const [state, setState] = useState<LinkState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [adding, setAdding] = useState(false);

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
      setSyncNote({ text: messageOf(e, 'Sync failed'), bad: true });
    } finally {
      setSyncing(false);
    }
  };

  /** New connection by default; "Sign in again" passes the reauth call instead. */
  const connect = async (start = () => call<LinkSession>('link:start')): Promise<void> => {
    setError(null);
    setState('opening');
    try {
      const session = await start();
      window.open(session.hostedLinkUrl, '_blank');
      setState('waiting');

      const accountsAdded = await pollForLink(session.linkToken);
      if (accountsAdded === null) {
        setError('Timed out waiting for the connection to finish.');
        setState('idle');
      } else {
        setState('importing');
        setAdded(accountsAdded);
        setState('done');
        institutions.refetch();
      }
    } catch (e) {
      setError(messageOf(e, 'Could not start the connection'));
      setState('idle');
    }
  };

  const busy = state === 'opening' || state === 'waiting' || state === 'importing';
  const list = institutions.data;
  const summary = netSummary(list);
  const hasBank = (list ?? []).some((i) => (i.source ?? 'plaid') === 'plaid');

  return (
    <>
      <PageHeader
        title="Accounts"
        {...(summary ? { sub: summary } : {})}
        actions={
          <>
            {hasBank && (
              <Button disabled={syncing} onClick={() => void sync()}>
                {syncing ? 'Syncing…' : 'Sync now'}
              </Button>
            )}
            <Button onClick={() => setAdding(true)}>Add an account by hand</Button>
            <Button variant="primary" disabled={busy} onClick={() => void connect()}>
              {busy ? 'Connecting…' : 'Connect an account'}
            </Button>
          </>
        }
      />

      {adding && <AddAccount onClose={() => setAdding(false)} onAdded={institutions.refetch} />}
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
      {state === 'done' && added === 0 && (
        <p className="ds-muted">Signed in again. Your accounts are syncing.</p>
      )}
      {state === 'done' && added !== null && added > 0 && (
        <p className="ds-muted">
          Connected. {added} account{added === 1 ? '' : 's'} added and your history is importing in
          the background.
        </p>
      )}
      {error && <p className="ds-warn">{error}</p>}

      {list && list.length === 0 && state === 'idle' && (
        <EmptyState
          title="No accounts connected yet"
          detail="Connect a bank through Plaid and Money imports your history automatically, or add an account by hand and enter transactions yourself."
        />
      )}

      {list && list.length > 0 && (
        <div className="ds-grid grid-cols-2">
          {list.map((institution) => (
            <BankCard
              key={institution.id}
              institution={institution}
              onChanged={institutions.refetch}
              onSignIn={() =>
                void connect(() =>
                  call<LinkSession>('institutions:reauth', { institutionId: institution.id }),
                )
              }
              signingIn={busy}
            />
          ))}
        </div>
      )}

      <p className="ds-caption">
        Turn off &quot;day-to-day&quot; for savings and investments so they do not inflate runway.
      </p>
    </>
  );
}
