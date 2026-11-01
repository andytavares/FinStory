import { useQuery, call } from '../lib/ipc';
import { relativeAge } from '../lib/format';
import { Button, Card, PageHeader } from '../components/ui';
import { SyncHistory } from '../charts/SyncHistory';
import { StatusTiles } from './health/StatusTiles';
import { ListRow, ListRows } from './reports/ListRows';
import type { HealthData } from './health/types';

/** A successful run has no size to chart, so every green bar is the same height. */
const OK_BAR_VALUE = 9;

function SyncHistoryCard({ data }: { data: HealthData }): React.JSX.Element {
  const oldestFirst = [...data.syncHistory].reverse();
  const runs = oldestFirst.map((run) => ({ ok: run.ok, value: OK_BAR_VALUE }));
  return (
    <Card title="Sync history" caption={runs.length === 1 ? 'Last run' : `Last ${runs.length} runs`}>
      <div className="mt-3">
        <SyncHistory runs={runs} />
      </div>
      <div className="ds-row ds-faint mt-1.5 text-[11px]">
        <span>{oldestFirst[0] ? relativeAge(oldestFirst[0].at) : ''}</span>
        <span className="ml-auto">now</span>
      </div>
    </Card>
  );
}

/** An empty dashboard has two causes: nothing was imported, or it all sits in an excluded account. */
function StoredCard({ data }: { data: HealthData }): React.JSX.Element {
  const { contents, metrics } = data;
  const rows: Array<[string, string | number]> = [
    ['Transactions', contents.transactions],
    ['Accounts', contents.accounts],
    [
      'Sorted without a model',
      metrics.localResolutionRate === null ? '—' : `${Math.round(metrics.localResolutionRate * 100)}%`,
    ],
    ['Still unsorted', contents.uncategorizable],
  ];
  return (
    <Card title="What is stored">
      <ListRows>
        {rows.map(([label, value]) => (
          <ListRow key={label}>
            <span className="ds-muted flex-1">{label}</span>
            <span className="ds-num">{value}</span>
          </ListRow>
        ))}
      </ListRows>
      {contents.transactions === 0 && (
        <p className="ds-faint mt-3 text-[12px]">
          Nothing has been imported yet, which is why every screen is empty. Use Sync now on the
          Accounts screen — it reports exactly what Plaid said.
        </p>
      )}
      {contents.transactions > 0 && contents.transactionsInEverydayAccounts === 0 && (
        <p className="ds-faint mt-3 text-[12px]">
          Every imported transaction sits in an account not marked day-to-day, so spending totals
          read zero. Turn accounts back on under Accounts.
        </p>
      )}
    </Card>
  );
}

/** FR-088: is it working, and if not, why. */
export function Health(): React.JSX.Element {
  const { data, loading } = useQuery<HealthData>('health:get');

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  if (!data) return <p className="text-[var(--color-ink-faint)]">Health unavailable.</p>;

  return (
    <div className="flex flex-col gap-[14px]">
      <PageHeader
        title="Health"
        sub="Everything Money depends on, checked now"
        actions={
          <Button onClick={() => void call('diagnostics:export', { destPath: '' })}>
            Export diagnostics
          </Button>
        }
      />
      <StatusTiles data={data} />
      <div className="ds-grid grid-cols-[1.3fr_1fr]">
        <SyncHistoryCard data={data} />
        <StoredCard data={data} />
      </div>
      <p className="ds-faint text-[12px]">
        Diagnostics contain no merchant names, amounts, balances, or credentials.
      </p>
    </div>
  );
}
