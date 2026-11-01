import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { EmptyState } from '../components/EmptyState';
import { shortDate } from '../lib/format';
import { assignableCategories } from '../components/TransactionEditor';
import type { MerchantRuleView, OverrideKind, OverrideRecord } from '@shared/types';

type CategoryChoice = ReadonlyArray<{ id: string; label: string }>;

const GROUPS: ReadonlyArray<{ kind: OverrideKind; title: string; blurb: string }> = [
  {
    kind: 'transaction_name',
    title: 'Single transaction renames',
    blurb: 'Applies to one transaction only.',
  },
  {
    kind: 'transaction_category',
    title: 'Single transaction categories',
    blurb: 'A category you set by hand on one transaction.',
  },
  { kind: 'excluded', title: 'Excluded from totals', blurb: 'Kept on record, left out of every total.' },
  {
    kind: 'recurring_rule',
    title: 'Recurring decisions',
    blurb: 'Covers every instance of that charge, including ones that arrive later.',
  },
  {
    kind: 'recurring',
    title: 'Single transaction recurring flags',
    blurb: 'Set on one transaction rather than the whole charge.',
  },
  { kind: 'note', title: 'Notes', blurb: 'Your own text on a transaction.' },
];

/**
 * Changes the user made to one transaction, plus recurring decisions.
 *
 * Without this a rename or exclusion made months ago is invisible until it
 * shows up wrong in a report, with no way to find what caused it.
 */
function OneOffChanges(): React.JSX.Element {
  const { data, loading, refetch } = useQuery<OverrideRecord[]>('overrides:list');
  const [busy, setBusy] = useState<string | null>(null);

  const clear = async (record: OverrideRecord): Promise<void> => {
    setBusy(record.id);
    try {
      await call('overrides:clear', { kind: record.kind, target: record.target });
      refetch();
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  const records = data ?? [];

  return (
    <div className="space-y-6">
      {records.length === 0 ? (
        <EmptyState
          title="You have not made any one-off changes yet"
          detail="Changes you make to a single transaction are listed here so you can find and undo them."
        />
      ) : (
        GROUPS.map((group) => {
          const rows = records.filter((r) => r.kind === group.kind);
          if (rows.length === 0) return null;
          return (
            <section key={group.kind} className="space-y-2">
              <div>
                <p className="eyebrow">{group.title}</p>
                <p className="text-[12px] text-[var(--color-ink-faint)]">{group.blurb}</p>
              </div>
              <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start gap-4 bg-[var(--color-surface)] px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px]">{r.label}</p>
                      <p className="text-[12px] text-[var(--color-ink-faint)]">
                        {r.original === null ? r.current : `${r.original} → ${r.current}`}
                      </p>
                      <p className="text-[12px] text-[var(--color-ink-faint)]">
                        {r.affectedCount === 1
                          ? '1 transaction'
                          : `${r.affectedCount} transactions`}
                        {r.occurredAt && ` · ${shortDate(r.occurredAt)}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void clear(r)}
                      disabled={busy === r.id}
                      aria-label={`Undo override for ${r.label}`}
                      className="btn"
                    >
                      {busy === r.id ? 'Undoing…' : 'Undo'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      {records.length > 0 && (
        <p className="text-[12px] text-[var(--color-ink-faint)]">
          Undoing hands the decision back to the app. Nothing is deleted from your transaction
          history.
        </p>
      )}
    </div>
  );
}

function RuleEditor({
  rule,
  choices,
  onDone,
}: {
  rule: MerchantRuleView;
  choices: CategoryChoice;
  onDone: () => void;
}): React.JSX.Element {
  const [name, setName] = useState(rule.displayName ?? '');
  const [categoryId, setCategoryId] = useState(rule.categoryId ?? '');

  const save = async (): Promise<void> => {
    await call('rules:update', {
      merchantKey: rule.merchantKey,
      displayName: name.trim() || null,
      ...(categoryId !== (rule.categoryId ?? '') && { categoryId: categoryId || null }),
    });
    onDone();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={rule.merchantName}
        aria-label={`Name for ${rule.merchantName}`}
        className="border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[13px]"
      />
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        aria-label={`Category for ${rule.merchantName}`}
        className="border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[13px]"
      >
        <option value="">No category rule</option>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <button type="button" className="btn" onClick={() => void save()}>
        Save
      </button>
      <button type="button" className="btn" onClick={onDone}>
        Cancel
      </button>
    </div>
  );
}

function MerchantRules(): React.JSX.Element {
  const rules = useQuery<MerchantRuleView[]>('rules:list');
  const categories = useQuery<Parameters<typeof assignableCategories>[0]>('categories:list');
  const [editing, setEditing] = useState<string | null>(null);

  const finish = (): void => {
    setEditing(null);
    rules.refetch();
  };
  const remove = async (rule: MerchantRuleView): Promise<void> => {
    await call('rules:delete', { merchantKey: rule.merchantKey });
    rules.refetch();
  };

  if (rules.loading && !rules.data) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  if (!rules.data?.length) {
    return (
      <EmptyState
        title="No merchant rules yet"
        detail="Choose All when you edit a transaction to make a rule for that merchant."
      />
    );
  }
  const choices = assignableCategories(categories.data ?? []);

  return (
    <table className="w-full text-left text-[13px]">
      <thead className="text-[12px] text-[var(--color-ink-faint)]">
        <tr>
          <th>Merchant</th>
          <th>Name shown</th>
          <th>Category</th>
          <th>Applies to</th>
          <th>Exceptions</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rules.data.map((r) => (
          <tr key={r.merchantKey} className="border-t border-[var(--color-line)]">
            {editing === r.merchantKey ? (
              <td colSpan={6} className="py-2">
                <RuleEditor rule={r} choices={choices} onDone={finish} />
              </td>
            ) : (
              <>
                <td className="py-2">{r.merchantName}</td>
                <td>{r.displayName ?? '—'}</td>
                <td>{r.categoryName ?? '—'}</td>
                <td>{r.transactionCount} charges · past and future</td>
                <td>{r.oneOffCount} one-off</td>
                <td className="space-x-2 text-right">
                  <button type="button" className="btn" onClick={() => setEditing(r.merchantKey)}>
                    Edit
                  </button>
                  <button type="button" className="btn" onClick={() => void remove(r)}>
                    Remove
                  </button>
                </td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Merchant rules and one-off changes: the two layers of user corrections. */
export function Overrides(): React.JSX.Element {
  const rules = useQuery<MerchantRuleView[]>('rules:list');
  const oneOffs = useQuery<OverrideRecord[]>('overrides:list');
  const [tab, setTab] = useState<'rules' | 'oneOffs'>('rules');
  const tabs = [
    ['rules', `Merchant rules · ${rules.data?.length ?? 0}`],
    ['oneOffs', `One-off changes · ${oneOffs.data?.length ?? 0}`],
  ] as const;

  return (
    <div className="space-y-4">
      <h1 className="text-[20px]">Rules</h1>
      <div className="flex border border-[var(--color-line)] text-[12px]">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={`px-3 py-1 ${
              tab === id
                ? 'bg-[var(--color-surface-raised)] text-[var(--color-ink)]'
                : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'rules' ? <MerchantRules /> : <OneOffChanges />}
    </div>
  );
}
