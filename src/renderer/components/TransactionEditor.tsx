import { useState } from 'react';
import { call } from '../lib/ipc';
import { transactionName } from '../lib/name';
import type { TransactionView } from '@shared/types';

interface CategoryOption {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly isHidden: boolean;
  readonly mergedIntoId: string | null;
}

/**
 * Flatten to selectable options, showing subcategories under their parent.
 *
 * Parent names resolve against ALL categories, not just the assignable ones: a
 * hidden or merged parent must still label its children, or they render as a
 * bare "› Coffee" with nothing in front of it.
 */
export function assignableCategories(
  categories: readonly CategoryOption[],
): Array<{ id: string; label: string }> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return categories
    .filter((c) => !c.isHidden && c.mergedIntoId === null)
    .map((c) => {
      const parentName = c.parentId ? byId.get(c.parentId)?.name : undefined;
      return {
        id: c.id,
        label: parentName ? `${parentName} › ${c.name}` : c.name,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Two-step category picker.
 *
 * Choosing a top-level category prompts for a subcategory, because a top-level
 * bucket like "Food" is rarely the answer the user actually wants — and a new
 * subcategory can be created inline rather than in a separate screen.
 */
function CategoryPicker({
  categories,
  value,
  transactionLabel,
  onChange,
  onCategoriesChanged,
}: {
  categories: readonly CategoryOption[];
  value: string;
  transactionLabel: string;
  onChange: (categoryId: string) => void;
  onCategoriesChanged?: (() => void) | undefined;
}): React.JSX.Element {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const selected = byId.get(value);
  const parentId = selected?.parentId ?? selected?.id ?? '';

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const visible = categories.filter((c) => !c.isHidden && c.mergedIntoId === null);
  const parents = visible
    .filter((c) => c.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const children = visible
    .filter((c) => c.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const createSubcategory = (): void => {
    const name = newName.trim();
    if (!name || !parentId) return;
    void call<{ id: string }>('categories:create', { name, parentId })
      .then((created) => {
        setCreating(false);
        setNewName('');
        setError(null);
        onCategoriesChanged?.();
        onChange(created.id);
      })
      .catch((e: { message?: string }) => setError(e.message ?? 'Could not add that'));
  };

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-[12px] text-[var(--color-ink-faint)]">Category</span>
        <select
          value={parentId}
          onChange={(e) => {
            // Selecting a parent lands on the parent; the subcategory prompt
            // below then asks for something more specific.
            onChange(e.target.value);
            setCreating(false);
          }}
          aria-label={`Category for ${transactionLabel}`}
          className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[13px]"
        >
          {parents.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      {parentId !== '' && (
        <label className="block">
          <span className="text-[12px] text-[var(--color-ink-faint)]">
            {value === parentId ? 'Choose a subcategory' : 'Subcategory'}
          </span>
          <select
            value={value === parentId ? '' : value}
            onChange={(e) => {
              if (e.target.value === '__new__') {
                setCreating(true);
                return;
              }
              setCreating(false);
              onChange(e.target.value || parentId);
            }}
            aria-label={`Subcategory for ${transactionLabel}`}
            className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[13px]"
          >
            <option value="">Keep in {byId.get(parentId)?.name ?? 'this category'}</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="__new__">+ New subcategory…</option>
          </select>
        </label>
      )}

      {creating && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createSubcategory();
                if (e.key === 'Escape') setCreating(false);
              }}
              placeholder={`New subcategory under ${byId.get(parentId)?.name ?? ''}`}
              aria-label="New subcategory name"
              className="flex-1 border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[13px] outline-none"
            />
            <button
              type="button"
              onClick={createSubcategory}
              className="border border-[var(--color-line)] px-3 text-[12px]"
            >
              Create
            </button>
          </div>
          {error && <p className="text-[12px] text-[var(--color-attention)]">{error}</p>}
        </div>
      )}
    </div>
  );
}

export function TransactionEditor({
  transaction,
  categories,
  onSaved,
  onCategoriesChanged,
}: {
  transaction: TransactionView;
  categories: readonly CategoryOption[];
  onSaved?: () => void;
  onCategoriesChanged?: () => void;
}): React.JSX.Element {
  const [name, setName] = useState(transaction.userMerchantName ?? '');
  const [note, setNote] = useState(transaction.userNote ?? '');
  const [excluded, setExcluded] = useState(transaction.userExcluded);
  const [recurring, setRecurring] = useState<string>(transaction.userRecurringOverride ?? '');
  const [categoryId, setCategoryId] = useState(transaction.categoryId);
  const [applyNameToMerchant, setApplyNameToMerchant] = useState(true);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pendingRetro, setPendingRetro] = useState<{ merchantKey: string; count: number } | null>(
    null,
  );

  const original = {
    name: transaction.userMerchantName ?? '',
    note: transaction.userNote ?? '',
    excluded: transaction.userExcluded,
    recurring: transaction.userRecurringOverride ?? '',
  };
  const dirty =
    name !== original.name ||
    note !== original.note ||
    excluded !== original.excluded ||
    recurring !== original.recurring ||
    categoryId !== transaction.categoryId;

  const save = async (): Promise<void> => {
    setStatus('saving');
    try {
      const result = await call<{
        merchantKey: string | null;
        retroactiveCandidateCount: number;
      }>('transactions:update', {
        transactionId: transaction.id,
        categoryId,
        userMerchantName: name.trim() || null,
        applyNameToMerchant,
        userNote: note.trim() || null,
        userExcluded: excluded,
        userRecurringOverride: recurring === '' ? null : recurring,
      });
      setStatus('saved');
      // Offer to fix the past too, stating the blast radius first (FR-074).
      if (result.retroactiveCandidateCount > 0 && result.merchantKey) {
        setPendingRetro({
          merchantKey: result.merchantKey,
          count: result.retroactiveCandidateCount,
        });
      } else {
        onSaved?.();
      }
    } catch {
      setStatus('error');
    }
  };

  const revert = (): void => {
    setName(original.name);
    setNote(original.note);
    setExcluded(original.excluded);
    setRecurring(original.recurring);
    setCategoryId(transaction.categoryId);
    setStatus('idle');
  };

  return (
    <div className="space-y-3 text-[13px]">
      <div className="grid grid-cols-2 gap-3">
        <CategoryPicker
          categories={categories}
          value={categoryId}
          transactionLabel={transactionName(transaction)}
          onChange={(next) => {
            setCategoryId(next);
            setStatus('idle');
          }}
          onCategoriesChanged={onCategoriesChanged}
        />

        <label className="block">
          <span className="text-[12px] text-[var(--color-ink-faint)]">
            Rename (imported as: {transaction.description})
          </span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setStatus('idle');
            }}
            // Shows what the name falls back to if this override is cleared.
            placeholder={transactionName({ ...transaction, userMerchantName: null })}
            className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[13px] outline-none"
          />
        </label>

        <label className="block">
          <span className="text-[12px] text-[var(--color-ink-faint)]">Recurring</span>
          <select
            value={recurring}
            onChange={(e) => {
              setRecurring(e.target.value);
              setStatus('idle');
            }}
            className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[13px]"
          >
            <option value="">Let Money decide</option>
            <option value="recurring">This is recurring</option>
            <option value="not_recurring">This is not recurring</option>
          </select>
        </label>
      </div>

      {name.trim() !== '' && (
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={applyNameToMerchant}
            onChange={(e) => setApplyNameToMerchant(e.target.checked)}
          />
          <span>
            Rename every transaction from this merchant
            <span className="ml-2 text-[12px] text-[var(--color-ink-faint)]">
              Past and future, not just this one
            </span>
          </span>
        </label>
      )}

      <label className="block">
        <span className="text-[12px] text-[var(--color-ink-faint)]">Note</span>
        <input
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setStatus('idle');
          }}
          className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[13px] outline-none"
        />
      </label>

      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={excluded}
          onChange={(e) => {
            setExcluded(e.target.checked);
            setStatus('idle');
          }}
        />
        <span>
          Exclude from spending totals
          <span className="ml-2 text-[12px] text-[var(--color-ink-faint)]">
            For something reimbursed or counted elsewhere
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!dirty || status === 'saving'}
          onClick={() => void save()}
          className="border border-[var(--color-line)] px-4 py-1 text-[13px] hover:bg-[var(--color-surface-raised)] disabled:opacity-40"
        >
          {status === 'saving' ? 'Saving…' : 'Save changes'}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={revert}
            className="text-[12px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          >
            Revert
          </button>
        )}
        {status === 'saved' && (
          <span className="text-[12px] text-[var(--color-ink-faint)]">Saved.</span>
        )}
        {status === 'error' && (
          <span className="text-[12px] text-[var(--color-attention)]">Could not save.</span>
        )}
      </div>

      {pendingRetro && (
        <div className="border border-[var(--color-attention)] bg-[var(--color-ground)] p-3">
          <p className="text-[13px]">
            This merchant will use that category from now on. Apply it to{' '}
            {pendingRetro.count} past transaction{pendingRetro.count === 1 ? '' : 's'} as well?
            <span className="mt-1 block text-[12px] text-[var(--color-ink-faint)]">
              Anything you already corrected by hand is left alone.
            </span>
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                void call('review:applyRetroactive', {
                  merchantKey: pendingRetro.merchantKey,
                  categoryId,
                }).then(() => {
                  setPendingRetro(null);
                  onSaved?.();
                });
              }}
              className="border border-[var(--color-line)] px-3 py-1 text-[12px]"
            >
              Apply to past too
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingRetro(null);
                onSaved?.();
              }}
              className="px-3 py-1 text-[12px] text-[var(--color-ink-faint)]"
            >
              Going forward only
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

