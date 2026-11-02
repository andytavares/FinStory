import { useState } from 'react';
import { call } from '../../lib/ipc';
import { toMinor } from '@shared/money';
import { Button, Card, Field, Select, TextInput } from '../../components/ui';

/** Subtype shown to the user, and the account type it is stored as. */
const KINDS = [
  { subtype: 'checking', label: 'Checking', type: 'depository' },
  { subtype: 'savings', label: 'Savings', type: 'depository' },
  { subtype: 'cash', label: 'Cash', type: 'depository' },
  { subtype: 'credit card', label: 'Credit card', type: 'credit' },
] as const;

/** An account no bank feed reports. Same shape as AddTransaction. */
export function AddAccount({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }): React.JSX.Element {
  const [name, setName] = useState('');
  const [subtype, setSubtype] = useState<(typeof KINDS)[number]['subtype']>('checking');
  const [balance, setBalance] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    const minor = toMinor(Number(balance));
    if (!name.trim() || balance.trim() === '' || !Number.isFinite(minor)) {
      setError('Fill in a name and the current balance.');
      return;
    }
    const kind = KINDS.find((k) => k.subtype === subtype) ?? KINDS[0];
    try {
      await call('accounts:create', { name: name.trim(), type: kind.type, subtype, currentBalanceMinor: minor });
      onAdded();
      onClose();
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not add that account.');
    }
  };

  return (
    <Card title="Add an account by hand" className="space-y-3">
      <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Wallet" aria-label="Account name" />
        </Field>
        <Field label="Kind">
          <Select
            value={subtype}
            onChange={(e) => setSubtype(e.target.value as typeof subtype)}
            aria-label="Account kind"
          >
            {KINDS.map((k) => (
              <option key={k.subtype} value={k.subtype}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={subtype === 'credit card' ? 'Current balance owed' : 'Current balance'}>
          <TextInput
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Current balance"
            className="ds-num"
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
          Add account
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </Card>
  );
}
