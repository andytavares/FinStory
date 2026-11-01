import { useState } from 'react';
import { useQuery, trackAction } from '../lib/ipc';
import { Qualification } from '../components/Qualification';
import { EmptyState } from '../components/EmptyState';
import { TransactionEditor } from '../components/TransactionEditor';
import { Button, PageHeader } from '../components/ui';
import { money, relativeAge } from '../lib/format';
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
  /** Only when the list is one account with a bank balance. */
  readonly balance?: { currentMinor: number; asOf: string | null };
}

interface CategoryOption {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly isHidden: boolean;
  readonly mergedIntoId: string | null;
}

/** The `transactions:query` params for the filters. */
function registerQuery(filters: Filters, spendingOnly: boolean): Record<string, unknown> {
  const { direction, categoryId, accountId, period, needsReviewOnly, search } = filters;
  return {
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
  };
}

function headerSub({ totalCount, balance }: RegisterResponse): string {
  const count = `${totalCount} this period`;
  // A balance is never shown without its age.
  return balance ? `${count} · Balance ${money(balance.currentMinor)}, updated ${relativeAge(balance.asOf)}` : count;
}

function categoryNameOf(categories: readonly CategoryOption[]): (id: string) => string {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  return (id) => names.get(id) ?? id;
}

/** The table, and the editor beside it once a row is selected. */
function RegisterGrid({
  rows,
  categories,
  onSaved,
}: {
  rows: TransactionView[];
  categories: CategoryOption[];
  onSaved: () => void;
}): React.JSX.Element | null {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (rows.length === 0) return null;
  const selected = rows.find((t) => t.id === selectedId) ?? null;
  const select = (id: string): void => {
    if (id !== selectedId) trackAction('ui:open-editor');
    setSelectedId(id === selectedId ? null : id);
  };
  return (
    <div className={`grid min-h-0 gap-[14px] ${selected ? 'grid-cols-[1fr_330px]' : ''}`}>
      <TransactionTable
        rows={rows}
        categoryName={categoryNameOf(categories)}
        selection={{ id: selectedId, onSelect: select }}
      />
      {selected && (
        <TransactionEditor
          key={selected.id}
          transaction={selected}
          categories={categories}
          onSaved={onSaved}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

/** What to say about the result: the category drill, data quality, loading and the empty state. */
function RegisterNotices({
  data,
  loading,
  drill,
}: {
  data: RegisterResponse | null;
  loading: boolean;
  drill: { active: boolean; spendingOnly: boolean; onChange: (spendingOnly: boolean) => void };
}): React.JSX.Element {
  return (
    <>
      {data && drill.active && (
        <DrillNote
          spendingOnly={drill.spendingOnly}
          shownAll={data.totalCount + data.excludedCount}
          onChange={drill.onChange}
        />
      )}
      {data && <Qualification dataComplete={data.dataComplete} staleInstitutions={data.staleInstitutions} />}
      {loading && <p className="ds-caption">Loading…</p>}
      {data && data.rows.length === 0 && (
        <EmptyState
          title="No transactions match"
          detail="Try a different search, or widen the date range."
        />
      )}
    </>
  );
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
  // Show everything in the category, which is what the count on the dashboard
  // says. Narrowing to what built the amount is offered, not imposed.
  const [spendingOnly, setSpendingOnly] = useState(false);
  const categories = useQuery<CategoryOption[]>('categories:list', { includeHidden: false });
  const institutions = useQuery<InstitutionSummary[]>('institutions:list');
  const { data, loading, refetch } = useQuery<RegisterResponse>(
    'transactions:query',
    registerQuery(filters, spendingOnly),
  );

  const categoryName = categoryNameOf(categories.data ?? []);
  const rows = data?.rows ?? [];
  const needsReviewCount = filters.needsReviewOnly
    ? (data?.totalCount ?? 0)
    : rows.filter((t) => t.needsReview).length;

  return (
    <>
      <PageHeader
        title="Transactions"
        {...(data && { sub: headerSub(data) })}
        actions={
          <Button onClick={() => downloadCsv(rows, categoryName)} disabled={rows.length === 0}>
            Export CSV
          </Button>
        }
      />

      <FilterRow
        filter={{ value: filters, onChange: patch }}
        choices={{
          accounts: (institutions.data ?? []).flatMap((i) => i.accounts),
          categories: categories.data ?? [],
        }}
        results={{ rows, needsReviewCount }}
      />

      <RegisterNotices
        data={data}
        loading={loading}
        drill={{ active: Boolean(filters.categoryId), spendingOnly, onChange: setSpendingOnly }}
      />

      <RegisterGrid rows={rows} categories={categories.data ?? []} onSaved={refetch} />
    </>
  );
}
