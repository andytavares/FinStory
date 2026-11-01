import { useState } from 'react';
import { call } from '../../lib/ipc';
import { Button, Select, TextInput } from '../../components/ui';
import { RULE_TYPES } from './rules';

/** Add a rule, including a second one of a kind that already exists. */
export function AddRule({ onCreated }: { onCreated: () => void }): React.JSX.Element {
  const [type, setType] = useState<string>('large_purchase');
  const [amount, setAmount] = useState('');
  const spec = RULE_TYPES.find((r) => r.id === type);

  const create = (): void => {
    void call('alertRules:create', {
      type,
      ...(spec?.needs === 'threshold' && amount
        ? { thresholdMinor: Math.round(Number(amount) * 100) }
        : {}),
      ...(spec?.needs === 'window' && amount ? { windowMinutes: Number(amount) } : {}),
    }).then(onCreated);
    setAmount('');
  };

  return (
    <div className="ds-row mt-2 flex-wrap rounded-[var(--radius-control)] border border-dashed border-[var(--color-line-strong)] p-2.5">
      <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="New alert type">
        {RULE_TYPES.map((r) => (
          <option key={r.id} value={r.id}>
            {r.option}
          </option>
        ))}
      </Select>
      {spec?.needs !== 'none' && (
        <TextInput
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={spec?.needs === 'window' ? 'minutes' : 'amount'}
          inputMode="decimal"
          aria-label="New alert value"
          className="ds-num"
          style={{ width: 110 }}
        />
      )}
      <Button size="sm" onClick={create}>
        Add alert
      </Button>
    </div>
  );
}
