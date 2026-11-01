import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { toMinor } from '@shared/money';
import type { InstitutionSummary } from '@shared/types';

const CADENCES = ['weekly', 'biweekly', 'semimonthly', 'monthly'] as const;

/**
 * Record income the detector cannot see (FR-071).
 *
 * Detection needs several matching deposits. Cash, a first paycheque, or an
 * irregular retainer never reaches that bar, and without this the balance
 * projection has nothing to work from.
 */
export function AddIncomeSource({ onAdded }: { onAdded: () => void }): React.JSX.Element {
  const institutions = useQuery<InstitutionSummary[]>('institutions:list');
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cadence, setCadence] = useState<(typeof CADENCES)[number]>('biweekly');
  const [nextDate, setNextDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const accounts = (institutions.data ?? []).flatMap((i) =>
    i.accounts.map((a) => ({ id: a.id, label: `${i.institutionName} · ${a.name}` })),
  );

  const submit = async (): Promise<void> => {
    setError(null);
    const minor = toMinor(Number(amount));
    if (!accountId || !Number.isFinite(minor) || minor <= 0 || !nextDate) {
      setError('Pick an account, an amount above zero, and the next expected date.');
      return;
    }
    try {
      await call('income:add', {
        accountId,
        ...(name.trim() ? { merchantKey: name.trim() } : {}),
        cadence,
        expectedAmountMinor: minor,
        nextExpectedDate: nextDate,
      });
      setOpen(false);
      setName('');
      setAmount('');
      setNextDate('');
      onAdded();
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not add that income source.');
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn"
      >
        Add income
      </button>
    );
  }

  return (
    <div className="order-last basis-full space-y-3 border border-[var(--color-line)] bg-[var(--color-surface)] p-4 text-[13px]">
      <p className="eyebrow">Income the detector cannot see</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[12px] text-[var(--color-ink-faint)]">Paid into</span>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            aria-label="Account"
            className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2"
          >
            <option value="">Choose an account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[12px] text-[var(--color-ink-faint)]">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Freelance retainer"
            aria-label="Name"
            className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-[12px] text-[var(--color-ink-faint)]">Amount each time</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="2400.00"
            aria-label="Amount"
            className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-[12px] text-[var(--color-ink-faint)]">How often</span>
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value as (typeof CADENCES)[number])}
            aria-label="How often"
            className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2"
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[12px] text-[var(--color-ink-faint)]">Next expected</span>
          <input
            type="date"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
            aria-label="Next expected"
            className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2"
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-[12px] text-[var(--color-attention)]">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          className="btn"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="btn"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
