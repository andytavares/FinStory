import { useState } from 'react';
import { useQuery } from '../lib/ipc';
import { Money } from '../components/Money';
import { Qualification } from '../components/Qualification';
import { EmptyState } from '../components/EmptyState';
import { shortDate } from '../lib/format';
import type { TransactionView, Qualified } from '@shared/types';

interface RegisterResponse extends Qualified {
  readonly rows: TransactionView[];
  readonly totalCount: number;
}

/** FR-064: searchable, filterable register across all connected accounts. */
export function Register({
  initialCategoryId,
}: {
  initialCategoryId: string | null;
}): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [categoryId] = useState(initialCategoryId);

  const { data, loading } = useQuery<RegisterResponse>('transactions:query', {
    ...(categoryId ? { categoryIds: [categoryId] } : {}),
    ...(search ? { merchantKey: search } : {}),
    confirmationStatus: 'all',
    limit: 100,
    offset: 0,
  });

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

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search merchants"
        className="w-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px] outline-none placeholder:text-[var(--color-ink-faint)]"
      />

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
            </tr>
          </thead>
          <tbody>
            {data.rows.map((t) => (
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
                  {t.categoryId}
                  {t.needsReview && (
                    <span className="ml-2 text-[11px] text-[var(--color-ink-faint)]">unconfirmed</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Money minor={t.amountMinor} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
