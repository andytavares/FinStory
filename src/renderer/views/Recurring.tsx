import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { EmptyState } from '../components/EmptyState';
import { Button, PageHeader, Segmented } from '../components/ui';
import { money } from '../lib/format';
import type { RecurringCandidateView } from '@shared/types';
import { RecurringCandidates } from './RecurringCandidates';
import { ConfirmedCard } from './recurring/ConfirmedCard';
import { Timeline } from './recurring/Timeline';
import type { RecurringChargeView } from '@shared/types';

type Tab = 'confirmed' | 'possible' | 'stopped';

function useRescan(refetch: () => void): { label: string | null; scanning: boolean; run: () => void } {
  const [label, setLabel] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const run = (): void => {
    setScanning(true);
    setLabel(null);
    void call<{ recurringCount: number }>('analysis:refresh')
      .then((r) => {
        setLabel(`Found ${r.recurringCount} recurring charge${r.recurringCount === 1 ? '' : 's'}`);
        refetch();
      })
      .finally(() => setScanning(false));
  };
  return { label, scanning, run };
}

/** FR-021: the ledger. Cumulative total is the column that changes behaviour. */
export function Recurring({
  onOpenMerchant,
}: {
  onOpenMerchant: (merchantKey: string) => void;
}): React.JSX.Element {
  const { data, loading, refetch } = useQuery<RecurringChargeView[]>('recurring:list', {
    includeInactive: true,
  });
  const candidates = useQuery<RecurringCandidateView[]>('recurring:candidates');
  const [tab, setTab] = useState<Tab>('confirmed');
  const rescan = useRescan(refetch);

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;

  const active = (data ?? []).filter((c) => c.status === 'active');
  const stopped = (data ?? []).filter((c) => c.status === 'inactive');
  const monthly = active.reduce((sum, c) => sum + c.monthlyCostMinor, 0);
  const yearly = active.reduce((sum, c) => sum + c.yearlyCostMinor, 0);
  const possibleCount = candidates.data?.length ?? 0;

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="Recurring"
        sub={active.length > 0 ? `${money(monthly)} a month · ${money(yearly)} a year` : ''}
        actions={
          <>
            {rescan.label && <span className="ds-caption">{rescan.label}</span>}
            <Button disabled={rescan.scanning} onClick={rescan.run}>
              {rescan.scanning ? 'Scanning…' : 'Rescan'}
            </Button>
          </>
        }
      />
      <Segmented
        label="Recurring charges"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'confirmed', label: `Confirmed · ${active.length}` },
          { value: 'possible', label: `Possible · ${possibleCount}` },
          { value: 'stopped', label: 'Stopped' },
        ]}
      />
      {tab === 'possible' ? (
        <RecurringCandidates
          onOpenMerchant={onOpenMerchant}
          onDecided={() => {
            refetch();
            candidates.refetch();
          }}
        />
      ) : (
        <ChargeGrid
          charges={tab === 'confirmed' ? active : stopped}
          showTimeline={tab === 'confirmed'}
          onChanged={refetch}
          onOpenMerchant={onOpenMerchant}
        />
      )}
    </div>
  );
}

function ChargeGrid({
  charges,
  showTimeline,
  onChanged,
  onOpenMerchant,
}: {
  charges: readonly RecurringChargeView[];
  showTimeline: boolean;
  onChanged: () => void;
  onOpenMerchant: (merchantKey: string) => void;
}): React.JSX.Element {
  if (charges.length === 0) {
    return (
      <EmptyState
        title="No recurring charges here yet"
        detail="Subscriptions appear here once a repeating pattern is established. Anything the app is unsure about is under Possible, waiting on your answer."
      />
    );
  }
  return (
    <>
      {showTimeline && <Timeline charges={charges} today={new Date()} />}
      <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {charges.map((c) => (
          <ConfirmedCard key={c.id} charge={c} onChanged={onChanged} onOpenMerchant={onOpenMerchant} />
        ))}
      </div>
    </>
  );
}
