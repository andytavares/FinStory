import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { toMinor } from '@shared/money';
import type { InstitutionSummary } from '@shared/types';
import { Button, Card, Field, Select, TextInput } from './ui';

const CADENCES = ['weekly', 'biweekly', 'semimonthly', 'monthly'] as const;

/**
 * Record income the detector cannot see (FR-071).
 *
 * Detection needs several matching deposits. Cash, a first paycheque, or an
 * irregular retainer never reaches that bar, and without this the balance
 * projection has nothing to work from. The caller owns the open state, so the
 * form can sit below the page header.
 */
export function AddIncomeSource({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}): React.JSX.Element | null {
  const institutions = useQuery<InstitutionSummary[]>('institutions:list');
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
      onClose();
      setName('');
      setAmount('');
      setNextDate('');
      onAdded();
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not add that income source.');
    }
  };

  if (!open) return null;

  return (
    <Card title="Income the detector cannot see" className="space-y-3">
      <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Field label="Paid into">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account">
            <option value="">Choose an account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Freelance retainer"
            aria-label="Name"
          />
        </Field>
        <Field label="Amount each time">
          <TextInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="2400.00"
            aria-label="Amount"
            className="ds-num"
          />
        </Field>
        <Field label="How often">
          <Select
            value={cadence}
            onChange={(e) => setCadence(e.target.value as (typeof CADENCES)[number])}
            aria-label="How often"
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Next expected">
          <TextInput
            type="date"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
            aria-label="Next expected"
          />
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-[12px] text-[var(--color-attention)]">
          {error}
        </p>
      )}
      <div className="ds-row">
        <Button variant="primary" onClick={() => void submit()}>
          Add
        </Button>
        <Button
          onClick={() => {
            onClose();
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </Card>
  );
}
