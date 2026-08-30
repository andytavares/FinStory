import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { Money } from '../components/Money';
import { Qualification } from '../components/Qualification';
import { EmptyState } from '../components/EmptyState';
import { TransactionEditor, assignableCategories } from '../components/TransactionEditor';
import { shortDate } from '../lib/format';
import type { TransactionView, Qualified } from '@shared/types';

interface RegisterResponse extends Qualified {
  readonly rows: TransactionView[];
  readonly totalCount: number;
}

interface CategoryOption {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly isHidden: boolean;
  readonly mergedIntoId: string | null;
}

/**
 * Everything the user controls on a transaction.
 *
 * Overrides are stored separately from the imported values, so a re-sync cannot
 * clobber an edit and the original stays visible underneath.
 */
export function Register({
  initialCategoryId,
}: {
  initialCategoryId: string | null;
}): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<'all' | 'in' | 'out'>('all');
  const [categoryId] = useState(initialCategoryId);
  const categories = useQuery<CategoryOption[]>('categories:list', { includeHidden: false });
  const [changed, setChanged] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);

  const { data, loading } = useQuery<RegisterResponse>('transactions:query', {
    ...(categoryId ? { categoryIds: [categoryId] } : {}),
    ...(search ? { merchantKey: search } : {}),
    direction,
    confirmationStatus: 'all',
    limit: 200,
    offset: 0,
  });

  const totals = (data?.rows ?? []).reduce(
    (acc, t) => {
      if (t.isInternalTransfer) return acc;
      return t.amountMinor > 0
        ? { ...acc, inMinor: acc.inMinor + t.amountMinor }
        : { ...acc, outMinor: acc.outMinor + t.amountMinor };
    },
    { inMinor: 0, outMinor: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[20px]">Transactions</h1>
        {data && (
          <p className="text-[12px] text-[var(--color-ink-faint)]">
            {data.totalCount} total{categoryId ? ` in ${categoryId}` : ''}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search merchants"
          aria-label="Search merchants"
          className="flex-1 border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px] outline-none placeholder:text-[var(--color-ink-faint)]"
        />
        {/* Income is a first-class part of the log, not a special case. */}
        <div className="flex border border-[var(--color-line)]">
          {(
            [
              ['all', 'All'],
              ['in', 'Money in'],
              ['out', 'Money out'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDirection(value)}
              className={`px-3 text-[12px] ${
                direction === value
                  ? 'bg-[var(--color-surface-raised)] text-[var(--color-ink)]'
                  : 'text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {data && data.rows.length > 0 && (
        <p className="text-[12px] text-[var(--color-ink-faint)]">
          <span className="numeric" style={{ color: 'var(--color-positive)' }}>
            +{(totals.inMinor / 100).toFixed(2)}
          </span>{' '}
          in ·{' '}
          <span className="numeric">−{Math.abs(totals.outMinor / 100).toFixed(2)}</span> out ·{' '}
          {data.rows.length} of {data.totalCount} shown, newest first
        </p>
      )}

      {data && <Qualification dataComplete={data.dataComplete} staleInstitutions={data.staleInstitutions} />}

      {loading && <p className="text-[var(--color-ink-faint)]">Loading…</p>}

      {data && data.rows.length === 0 && (
        <EmptyState
          title="No transactions match"
          detail="Try a different search, or widen the date range."
        />
      )}

      {data && data.rows.length > 0 && (
        <table className="w-full border border-[var(--color-line)] text-[13px]">
          <thead>
            <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface)] text-left">
              <th className="px-3 py-2 font-normal text-[var(--color-ink-faint)]">Date</th>
              <th className="px-3 py-2 font-normal text-[var(--color-ink-faint)]">Merchant</th>
              <th className="px-3 py-2 font-normal text-[var(--color-ink-faint)]">Category</th>
              <th className="px-3 py-2 text-right font-normal text-[var(--color-ink-faint)]">Amount</th>
              <th className="px-2 py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {data.rows.flatMap((t) => [
              <tr key={t.id} className="border-b border-[var(--color-line)] last:border-0">
                <td className="numeric px-3 py-2 text-[var(--color-ink-muted)]">
                  {shortDate(t.postedDate)}
                </td>
                <td className="px-3 py-2">
                  {t.merchantName ?? t.description}
                  {t.originalCurrency && (
                    // Display-only; never enters a calculation (FR-085).
                    <span className="ml-2 text-[11px] text-[var(--color-ink-faint)]">
                      {t.originalCurrency} {((t.originalAmountMinor ?? 0) / 100).toFixed(2)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-[var(--color-ink-muted)]">
                  {/* Any transaction is recategorizable here, not only flagged ones. */}
                  <select
                    value={changed[t.id] ?? t.categoryId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setChanged((prev) => ({ ...prev, [t.id]: next }));
                      void call('review:recategorize', {
                        transactionIds: [t.id],
                        categoryId: next,
                      });
                    }}
                    aria-label={`Category for ${t.merchantName ?? t.description}`}
                    className="border border-transparent bg-transparent px-1 py-0.5 text-[13px] text-[var(--color-ink-muted)] hover:border-[var(--color-line)]"
                  >
                    {assignableCategories(categories.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {t.needsReview && !changed[t.id] && (
                    <span className="ml-1 text-[11px] text-[var(--color-ink-faint)]">unconfirmed</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Money minor={t.amountMinor} direction />
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setEditing(editing === t.id ? null : t.id)}
                    aria-label={`Edit ${t.merchantName ?? t.description}`}
                    className="text-[12px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
                  >
                    {editing === t.id ? 'Close' : 'Edit'}
                  </button>
                </td>
              </tr>,
              ...(editing === t.id
                ? [
                    <tr key={`${t.id}-edit`} className="border-b border-[var(--color-line)]">
                      <td colSpan={5} className="bg-[var(--color-surface)] px-3 py-3">
                        <TransactionEditor
                          transaction={t}
                          categories={categories.data ?? []}
                          onCategoriesChanged={categories.refetch}
                        />
                      </td>
                    </tr>,
                  ]
                : []),
            ])}
          </tbody>
        </table>
      )}
    </div>
  );
}
