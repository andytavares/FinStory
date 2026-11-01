import { useState } from 'react';
import { call, useQuery } from '../lib/ipc';
import { transactionName } from '../lib/name';
import { categoryColor } from '../lib/categoryColor';
import { accountLabel, shortDate, signedMoney } from '../lib/format';
import {
  Button,
  Drawer,
  Field,
  MerchantMark,
  Segmented,
  Select,
  TextInput,
  Toggle,
} from './ui';
import type { MerchantRuleView, TransactionView } from '@shared/types';

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

function ScopeField({
  scope,
  onChange,
  importedName,
  ruleCategory,
}: {
  scope: 'transaction' | 'merchant';
  onChange: (next: 'transaction' | 'merchant') => void;
  importedName: string;
  ruleCategory: string | null;
}): React.JSX.Element {
  return (
    <div className="ds-field">
      Apply this change to
      <Segmented
        label="Apply this change to"
        value={scope}
        onChange={onChange}
        options={[
          { value: 'transaction', label: 'This transaction' },
          { value: 'merchant', label: `All ${importedName} (rule)` },
        ]}
      />
      {ruleCategory && scope === 'transaction' && (
        <span className="text-[var(--color-ink-muted)]">
          A rule already sorts {importedName} into {ruleCategory}. This edit changes only this one
          charge.
        </span>
      )}
    </div>
  );
}

export function TransactionEditor({
  transaction,
  categories,
  onSaved,
  onClose,
}: {
  transaction: TransactionView;
  categories: readonly CategoryOption[];
  onSaved?: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const [name, setName] = useState(transaction.userMerchantName ?? '');
  const [note, setNote] = useState(transaction.userNote ?? '');
  const [excluded, setExcluded] = useState(transaction.userExcluded);
  const [categoryId, setCategoryId] = useState(transaction.categoryId);
  const [recurring, setRecurring] = useState<string>(transaction.userRecurringOverride ?? '');
  const [scope, setScope] = useState<'transaction' | 'merchant'>('transaction');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const rules = useQuery<MerchantRuleView[]>('rules:list');
  const displayName = transactionName(transaction);
  const importedName = transactionName({ ...transaction, userMerchantName: null });
  const rule = rules.data?.find((r) => r.merchantKey === transaction.merchantKey);

  const original = {
    name: transaction.userMerchantName ?? '',
    note: transaction.userNote ?? '',
    recurring: transaction.userRecurringOverride ?? '',
  };
  const dirty =
    name !== original.name ||
    note !== original.note ||
    recurring !== original.recurring ||
    excluded !== transaction.userExcluded ||
    categoryId !== transaction.categoryId;

  const edit = <T,>(set: (value: T) => void) => (value: T): void => {
    set(value);
    setStatus('idle');
  };

  const save = async (): Promise<void> => {
    setStatus('saving');
    try {
      await call('transactions:update', {
        transactionId: transaction.id,
        categoryId,
        // Unchanged names are left out: with scope merchant, null would delete the rule's name.
        ...(name !== original.name && { userMerchantName: name.trim() || null }),
        scope,
        userNote: note.trim() || null,
        userRecurringOverride: recurring === '' ? null : recurring,
        userExcluded: excluded,
      });
      setStatus('idle');
      onSaved?.();
    } catch {
      setStatus('error');
    }
  };

  const revert = (): void => {
    setName(original.name);
    setNote(original.note);
    setRecurring(original.recurring);
    setExcluded(transaction.userExcluded);
    setCategoryId(transaction.categoryId);
    setStatus('idle');
  };

  return (
    <Drawer className="sticky top-0 self-start" role="complementary" aria-label={`Edit ${displayName}`}>
      <div className="ds-row">
        <MerchantMark name={displayName} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{displayName}</div>
          <div className="ds-caption">
            {shortDate(transaction.postedDate)} · {accountLabel(transaction.accountName, transaction.accountMask)} · imported as {transaction.description}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="ds-num text-[24px] font-semibold">{signedMoney(transaction.amountMinor)}</div>

      <Field label="Category">
        <span className="ds-row">
          <i
            aria-hidden
            className="h-[9px] w-[9px] shrink-0 rounded-full"
            style={{ background: categoryColor(categoryId) }}
          />
          <Select
            className="flex-1"
            value={categoryId}
            aria-label={`Category for ${displayName}`}
            onChange={(e) => edit(setCategoryId)(e.target.value)}
          >
            {assignableCategories(categories).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </span>
      </Field>

      <Field label="Name">
        <TextInput
          value={name}
          placeholder={importedName}
          onChange={(e) => edit(setName)(e.target.value)}
        />
      </Field>

      <Field label="Recurring">
        <Select value={recurring} onChange={(e) => edit(setRecurring)(e.target.value)}>
          <option value="">Let Money decide</option>
          <option value="recurring">This is recurring</option>
          <option value="not_recurring">This is not recurring</option>
        </Select>
      </Field>

      {transaction.merchantKey && (
        <ScopeField
          scope={scope}
          onChange={setScope}
          importedName={importedName}
          ruleCategory={rule?.categoryName ?? null}
        />
      )}

      <Field label="Note">
        <TextInput
          value={note}
          placeholder="Add a note"
          onChange={(e) => edit(setNote)(e.target.value)}
        />
      </Field>

      <div className="ds-row text-[12px]">
        <Toggle checked={excluded} onChange={edit(setExcluded)} label="Leave out of spending totals" />
        Leave out of spending totals
      </div>

      <div className="ds-row mt-auto">
        <Button variant="ghost" onClick={revert}>
          Revert
        </Button>
        {status === 'error' && (
          <span className="text-[12px] text-[var(--color-attention)]">Could not save.</span>
        )}
        <Button
          variant="primary"
          className="ml-auto"
          disabled={!dirty || status === 'saving'}
          onClick={() => void save()}
        >
          Save
        </Button>
      </div>
    </Drawer>
  );
}
