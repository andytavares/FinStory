import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { toMinor } from '@shared/money';
import type { InstitutionSummary } from '@shared/types';
import { assignableCategories, type CategoryOption } from './TransactionEditor';
import { Button, Card, Field, Select, TextInput } from './ui';

/** A transaction the bank feed does not have, such as cash. Same shape as AddIncomeSource. */
export function AddTransaction({
  categories,
  onClose,
  onAdded,
}: {
  categories: readonly CategoryOption[];
  onClose: () => void;
  onAdded: () => void;
}): React.JSX.Element {
  const institutions = useQuery<InstitutionSummary[]>('institutions:list');
  const [accountId, setAccountId] = useState('');
  const [postedDate, setPostedDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const accounts = (institutions.data ?? []).flatMap((i) =>
    i.accounts.map((a) => ({ id: a.id, label: `${i.institutionName} · ${a.name}` })),
  );

  const submit = async (): Promise<void> => {
    setError(null);
    const minor = toMinor(Number(amount));
    if (
      !accountId ||
      !postedDate ||
      !payee.trim() ||
      !categoryId ||
      !Number.isFinite(minor) ||
      minor <= 0
    ) {
      setError('Fill in the account, date, payee, an amount above zero, and a category.');
      return;
    }
    try {
      await call('transactions:create', {
        accountId,
        postedDate,
        amountMinor: direction === 'out' ? -minor : minor,
        payee: payee.trim(),
        categoryId,
      });
      onAdded();
      onClose();
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not add that transaction.');
    }
  };

  return (
    <Card title="Add a transaction" className="space-y-3">
      <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Field label="Account">
          <Select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            aria-label="Account"
          >
            <option value="">Choose an account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <TextInput
            type="date"
            value={postedDate}
            onChange={(e) => setPostedDate(e.target.value)}
            aria-label="Date"
          />
        </Field>
        <Field label="Payee">
          <TextInput
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            placeholder="Farmers market"
            aria-label="Payee"
          />
        </Field>
        <Field label="Amount">
          <TextInput
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="12.50"
            aria-label="Amount"
            className="ds-num"
          />
        </Field>
        <Field label="Direction">
          <Select
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'out' | 'in')}
            aria-label="Direction"
          >
            <option value="out">Money out</option>
            <option value="in">Money in</option>
          </Select>
        </Field>
        <Field label="Category">
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            aria-label="Category"
          >
            <option value="">Choose a category</option>
            {assignableCategories(categories).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
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
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </Card>
  );
}
