import { useState } from 'react';
import { useQuery, trackAction } from '../lib/ipc';
import { Qualification } from '../components/Qualification';
import { EmptyState } from '../components/EmptyState';
import { TransactionEditor } from '../components/TransactionEditor';
import { Button, PageHeader } from '../components/ui';
import { DrillNote } from './transactions/DrillNote';
import { downloadCsv } from './transactions/exportCsv';
import { FilterRow, type Filters } from './transactions/FilterRow';
import { TransactionTable } from './transactions/TransactionTable';
import type { InstitutionSummary, TransactionView, Qualified } from '@shared/types';

interface RegisterResponse extends Qualified {
  readonly rows: TransactionView[];
  readonly totalCount: number;
  /** In this category but left out of the spending figure. */
  readonly excludedCount: number;
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
  initialMerchantKey,
}: {
  initialCategoryId: string | null;
  initialMerchantKey?: string | null;
}): React.JSX.Element {
  const [filters, setFilters] = useState<Filters>({
    direction: 'all',
    categoryId: initialCategoryId,
    accountId: null,
    period: null,
    needsReviewOnly: false,
    search: initialMerchantKey ?? '',
  });
  const patch = (change: Partial<Filters>): void => setFilters({ ...filters, ...change });
  const { direction, categoryId, accountId, period, needsReviewOnly, search } = filters;
  // Show everything in the category, which is what the count on the dashboard
  // says. Narrowing to what built the amount is offered, not imposed.
  const [spendingOnly, setSpendingOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const categories = useQuery<CategoryOption[]>('categories:list', { includeHidden: false });
  const institutions = useQuery<InstitutionSummary[]>('institutions:list');

  const { data, loading, refetch } = useQuery<RegisterResponse>('transactions:query', {
    ...(categoryId ? { categoryIds: [categoryId] } : {}),
    ...(accountId ? { accountIds: [accountId] } : {}),
    ...(period ? { periodStart: period.start, periodEnd: period.end } : {}),
    ...(search ? { merchantKey: search } : {}),
    needsReviewOnly,
    spendingOnly,
    direction,
    confirmationStatus: 'all',
    limit: 200,
    offset: 0,
  });

  const names = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
  const categoryName = (id: string): string => names.get(id) ?? id;
  const rows = data?.rows ?? [];
  const selected = rows.find((t) => t.id === selectedId) ?? null;
  const needsReviewCount = needsReviewOnly ? (data?.totalCount ?? 0) : rows.filter((t) => t.needsReview).length;

  const select = (id: string): void => {
    if (id !== selectedId) trackAction('ui:open-editor');
    setSelectedId(id === selectedId ? null : id);
  };

  return (
    <>
      <PageHeader
        title="Transactions"
        {...(data && { sub: `${data.totalCount} this period` })}
        actions={
          <Button onClick={() => downloadCsv(rows, categoryName)} disabled={rows.length === 0}>
            Export CSV
          </Button>
        }
      />

      <FilterRow
        filters={filters}
        onChange={patch}
        accounts={(institutions.data ?? []).flatMap((i) => i.accounts)}
        categories={categories.data ?? []}
        needsReviewCount={needsReviewCount}
        rows={rows}
      />

      {data && categoryId && (
        <DrillNote
          spendingOnly={spendingOnly}
          shownAll={data.totalCount + data.excludedCount}
          onChange={setSpendingOnly}
        />
      )}
      {data && <Qualification dataComplete={data.dataComplete} staleInstitutions={data.staleInstitutions} />}
      {loading && <p className="ds-caption">Loading…</p>}

      {data && rows.length === 0 && (
        <EmptyState
          title="No transactions match"
          detail="Try a different search, or widen the date range."
        />
      )}

      {rows.length > 0 && (
        <div className={`grid min-h-0 gap-[14px] ${selected ? 'grid-cols-[1fr_330px]' : ''}`}>
          <TransactionTable
            rows={rows}
            categoryName={categoryName}
            selectedId={selectedId}
            onSelect={select}
          />
          {selected && (
            <TransactionEditor
              key={selected.id}
              transaction={selected}
              categories={categories.data ?? []}
              onSaved={refetch}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}
    </>
  );
}
