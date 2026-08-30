import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { transactionName } from '../lib/name';
import { Money } from '../components/Money';
import { EmptyState } from '../components/EmptyState';
import { TransactionEditor, assignableCategories } from '../components/TransactionEditor';
import { shortDate } from '../lib/format';
import type { ReviewItem } from '@shared/types';

interface QueueResponse {
  readonly rows: ReviewItem[];
  readonly totalCount: number;
}

interface CategoryOption {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly isHidden: boolean;
  readonly mergedIntoId: string | null;
}

interface RecategorizeResult {
  readonly updated: number;
  readonly retroactiveCandidateCount: number;
}

/**
 * FR-067: clearing a month of flags is a short session, not a per-transaction
 * chore — so selection is bulk by default.
 *
 * FR-074: a retroactive pass states its blast radius and changes nothing until
 * confirmed.
 */
export function Review(): React.JSX.Element {
  const { data, loading, refetch } = useQuery<QueueResponse>('review:queue', { limit: 100, offset: 0 });
  const categories = useQuery<CategoryOption[]>('categories:list', { includeHidden: false });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [chosenCategory, setChosenCategory] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [pendingRetro, setPendingRetro] = useState<{
    merchantKey: string;
    categoryId: string;
    count: number;
  } | null>(null);

  const toggle = (id: string): void => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const recategorize = async (categoryId: string): Promise<void> => {
    if (!categoryId) return;
    const result = await call<RecategorizeResult>('review:recategorize', {
      transactionIds: [...selected],
      categoryId,
    });
    const first = data?.rows.find((r) => selected.has(r.transaction.id));
    if (result.retroactiveCandidateCount > 0 && first) {
      setPendingRetro({
        merchantKey: transactionName(first.transaction),
        categoryId,
        count: result.retroactiveCandidateCount,
      });
    }
    setSelected(new Set());
    refetch();
  };

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  if (!data || data.rows.length === 0) {
    return (
      <EmptyState
        title="Nothing needs your review"
        detail="Low-confidence categorizations land here. Everything else is handled without you."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[20px]">Review</h1>
        <p className="text-[12px] text-[var(--color-ink-faint)]">{data.totalCount} flagged</p>
      </div>

      {pendingRetro && (
        <div className="border border-[var(--color-attention)] bg-[var(--color-surface)] p-4">
          <p className="text-[13px]">
            Also apply this to {pendingRetro.count} past transaction
            {pendingRetro.count === 1 ? '' : 's'} from this merchant? Transactions you have already
            corrected by hand will be left alone.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                void call('review:applyRetroactive', {
                  merchantKey: pendingRetro.merchantKey,
                  categoryId: pendingRetro.categoryId,
                });
                setPendingRetro(null);
              }}
              className="border border-[var(--color-line)] px-3 py-1 text-[12px] hover:bg-[var(--color-surface-raised)]"
            >
              Apply to past
            </button>
            <button
              type="button"
              onClick={() => setPendingRetro(null)}
              className="px-3 py-1 text-[12px] text-[var(--color-ink-faint)]"
            >
              Going forward only
            </button>
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-3 border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2">
          <span className="text-[13px]">{selected.size} selected</span>
          <label className="flex items-center gap-2 text-[12px]">
            <span className="text-[var(--color-ink-faint)]">Change to</span>
            <select
              value={chosenCategory}
              onChange={(e) => setChosenCategory(e.target.value)}
              className="border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[12px]"
            >
              <option value="">Choose a category</option>
              {assignableCategories(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!chosenCategory}
            onClick={() => {
              void recategorize(chosenCategory);
              setChosenCategory('');
            }}
            className="border border-[var(--color-line)] px-3 py-1 text-[12px] disabled:opacity-40"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => {
              void call('review:dismissFlag', { transactionIds: [...selected] }).then(refetch);
              setSelected(new Set());
            }}
            className="text-[12px] text-[var(--color-ink-faint)]"
          >
            Accept as guessed
          </button>
        </div>
      )}

      <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
        {data.rows.flatMap((item) => [
          <li
            key={item.transaction.id}
            className="flex items-start gap-3 bg-[var(--color-surface)] px-4 py-3"
          >
            <input
              type="checkbox"
              checked={selected.has(item.transaction.id)}
              onChange={() => toggle(item.transaction.id)}
              className="mt-1"
              aria-label={`Select ${transactionName(item.transaction)}`}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px]">{transactionName(item.transaction)}</p>
              <p className="text-[12px] text-[var(--color-ink-faint)]">
                {shortDate(item.transaction.postedDate)} · guessed {item.guessCategoryId} at{' '}
                {Math.round(item.confidence * 100)}%
              </p>
              {/* US6 AS1: the guess must be inspectable, not opaque. */}
              {item.reasoning && (
                <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">{item.reasoning}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <Money minor={item.transaction.amountMinor} direction />
              <button
                type="button"
                onClick={() =>
                  setEditing(editing === item.transaction.id ? null : item.transaction.id)
                }
                aria-label={`Edit ${transactionName(item.transaction)}`}
                className="text-[12px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
              >
                {editing === item.transaction.id ? 'Close' : 'Edit'}
              </button>
            </div>
          </li>,
          ...(editing === item.transaction.id
            ? [
                <li
                  key={`${item.transaction.id}-edit`}
                  className="bg-[var(--color-surface-raised)] px-4 py-3"
                >
                  <TransactionEditor
                    transaction={item.transaction}
                    categories={categories.data ?? []}
                    onCategoriesChanged={categories.refetch}
                    onSaved={() => {
                      setEditing(null);
                      refetch();
                    }}
                  />
                </li>,
              ]
            : []),
        ])}
      </ul>
    </div>
  );
}
