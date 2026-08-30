import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { Money } from '../components/Money';
import { EmptyState } from '../components/EmptyState';
import { shortDate } from '../lib/format';
import type { RecurringChargeView, RecurringCandidateView } from '@shared/types';
import { RecurringCandidates } from './RecurringCandidates';

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
  const [tab, setTab] = useState<'confirmed' | 'possible'>('confirmed');
  const [scanned, setScanned] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const rescan = (
    <div className="flex items-center gap-3">
      {scanned && <span className="text-[12px] text-[var(--color-ink-faint)]">{scanned}</span>}
      <button
        type="button"
        disabled={scanning}
        onClick={() => {
          setScanning(true);
          setScanned(null);
          void call<{ recurringCount: number }>('analysis:refresh')
            .then((r) => {
              // Rescan used to give no sign it had run at all.
              setScanned(
                `Found ${r.recurringCount} recurring charge${r.recurringCount === 1 ? '' : 's'}`,
              );
              refetch();
            })
            .finally(() => setScanning(false));
        }}
        className="border border-[var(--color-line)] px-3 py-1 text-[12px] hover:bg-[var(--color-surface-raised)] disabled:opacity-40"
      >
        {scanning ? 'Scanning…' : 'Rescan'}
      </button>
    </div>
  );

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;

  const active = (data ?? []).filter((c) => c.status === 'active');
  const possibleCount = candidates.data?.length ?? 0;
  const monthlyTotal = active.reduce((sum, c) => sum + normalizeMonthly(c), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[20px]">Recurring</h1>
        <div className="flex items-center gap-4">
          {active.length > 0 && (
            <p className="text-[13px] text-[var(--color-ink-muted)]">
              <Money minor={monthlyTotal} magnitude /> a month across {active.length}
            </p>
          )}
          {rescan}
        </div>
      </div>

      <div className="flex gap-1 border-b border-[var(--color-line)]">
        {(
          [
            { id: 'confirmed' as const, label: 'Confirmed' },
            {
              id: 'possible' as const,
              label: `Possible${possibleCount > 0 ? ` (${possibleCount})` : ''}`,
            },
          ]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] ${
              tab === t.id
                ? 'border-[var(--color-ink)] text-[var(--color-ink)]'
                : 'border-transparent text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'possible' ? (
        <RecurringCandidates
          onOpenMerchant={onOpenMerchant}
          onDecided={() => {
            refetch();
            candidates.refetch();
          }}
        />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="No recurring charges detected yet"
          detail="Subscriptions appear here once a repeating pattern is established. Anything the app is unsure about is under Possible, waiting on your answer."
        />
      ) : (
        <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
          {(data ?? []).map((c) => (
            <Row key={c.id} charge={c} onChanged={refetch} onOpenMerchant={onOpenMerchant} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  charge,
  onChanged,
  onOpenMerchant,
}: {
  charge: RecurringChargeView;
  onChanged: () => void;
  onOpenMerchant: (merchantKey: string) => void;
}): React.JSX.Element {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(charge.merchantName);

  const rename = (): void => {
    const next = name.trim();
    setRenaming(false);
    if (!next || next === charge.merchantName) return;
    // Applies to every transaction from this merchant, matching the register.
    void call('merchants:rename', { merchantKey: charge.merchantKey, displayName: next }).then(
      onChanged,
    );
  };

  return (
    <li
      className={`bg-[var(--color-surface)] px-4 py-3 ${charge.status === 'inactive' ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={rename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') rename();
                if (e.key === 'Escape') {
                  setName(charge.merchantName);
                  setRenaming(false);
                }
              }}
              aria-label={`Rename ${charge.merchantName}`}
              className="w-full border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[13px] outline-none"
            />
          ) : (
            <p className="truncate text-[13px]">{charge.merchantName}</p>
          )}
          <p className="text-[12px] text-[var(--color-ink-faint)]">
            {charge.cadence} · since {shortDate(charge.firstSeenDate)}
            {charge.status === 'inactive' && ' · stopped'}
          </p>
        </div>

        {charge.amountChanges.length > 0 && (
          <span className="text-[11px] text-[var(--color-attention)]">price changed</span>
        )}

        <div className="text-right">
          <Money minor={charge.currentAmountMinor} magnitude className="block" />
          <span className="text-[11px] text-[var(--color-ink-faint)]">
            <Money minor={charge.cumulativePaidMinor} magnitude /> paid
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4 text-[12px] text-[var(--color-ink-faint)]">
        <button
          type="button"
          onClick={() => onOpenMerchant(charge.merchantKey)}
          className="hover:text-[var(--color-ink)]"
        >
          See transactions
        </button>
        <button type="button" onClick={() => setRenaming(true)} className="hover:text-[var(--color-ink)]">
          Rename
        </button>
        {charge.status === 'active' ? (
          <button
            type="button"
            onClick={() => void call('recurring:markNotRecurring', { id: charge.id }).then(onChanged)}
            className="hover:text-[var(--color-ink)]"
          >
            Not recurring
          </button>
        ) : (
          <span>Marked not recurring</span>
        )}
      </div>
    </li>
  );
}

/** Normalize each cadence to a monthly figure so the header total is comparable. */
function normalizeMonthly(c: RecurringChargeView): number {
  const perMonth: Record<string, number> = {
    weekly: 4.33,
    biweekly: 2.17,
    semimonthly: 2,
    monthly: 1,
    quarterly: 1 / 3,
    annual: 1 / 12,
  };
  return Math.round(c.currentAmountMinor * (perMonth[c.cadence] ?? 1));
}
