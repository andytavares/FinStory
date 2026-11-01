import { X } from 'lucide-react';
import { Button, Chip, Segmented } from '../../components/ui';
import { assignableCategories } from '../../components/TransactionEditor';
import { signedMoney } from '../../lib/format';
import { trackAction } from '../../lib/ipc';
import { FilterMenu } from './FilterMenu';
import { PERIOD_OPTIONS, periodFor, type Period } from './period';
import type { AccountRow, TransactionView } from '@shared/types';

export interface Filters {
  readonly direction: 'all' | 'in' | 'out';
  readonly categoryId: string | null;
  readonly accountId: string | null;
  readonly period: Period | null;
  readonly needsReviewOnly: boolean;
  readonly search: string;
}

interface CategoryOption {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly isHidden: boolean;
  readonly mergedIntoId: string | null;
}

const DIRECTIONS = [
  { value: 'all', label: 'All' },
  { value: 'in', label: 'Money in' },
  { value: 'out', label: 'Money out' },
] as const;

function Totals({ rows }: { rows: readonly TransactionView[] }): React.JSX.Element {
  const counted = rows.filter((t) => !t.isInternalTransfer);
  const sum = (keep: (minor: number) => boolean): number =>
    counted
      .map((t) => t.amountMinor)
      .filter(keep)
      .reduce((a, b) => a + b, 0);
  return (
    <span className="ds-num ml-auto">
      <span className="ds-pos">{signedMoney(sum((m) => m > 0))}</span>{' '}
      <span className="ds-faint">in ·</span> {signedMoney(sum((m) => m <= 0))}{' '}
      <span className="ds-faint">out</span>
    </span>
  );
}

interface FilterRowProps {
  readonly filter: {
    readonly value: Filters;
    readonly onChange: (patch: Partial<Filters>) => void;
  };
  /** What the account and category menus offer. */
  readonly choices: {
    readonly accounts: readonly AccountRow[];
    readonly categories: readonly CategoryOption[];
  };
  /** What the current filters matched. */
  readonly results: {
    readonly rows: readonly TransactionView[];
    readonly needsReviewCount: number;
  };
}

function FilterMenus({
  filter,
  choices,
}: Pick<FilterRowProps, 'filter' | 'choices'>): React.JSX.Element {
  const { value: filters, onChange } = filter;
  const { accounts, categories } = choices;
  return (
    <>
      <FilterMenu
        labels={{ title: 'Account', any: 'All' }}
        choice={{ value: filters.accountId, onChange: (accountId) => onChange({ accountId }) }}
        options={accounts.map((a) => ({ value: a.id, label: a.name }))}
      />
      <FilterMenu
        labels={{ title: 'Category', any: 'Any' }}
        choice={{ value: filters.categoryId, onChange: (categoryId) => onChange({ categoryId }) }}
        options={assignableCategories(categories).map((c) => ({ value: c.id, label: c.label }))}
      />
      <FilterMenu
        labels={{ title: '', any: 'All dates' }}
        choice={{
          value: filters.period?.key ?? null,
          onChange: (key) => onChange({ period: key ? periodFor(key) : null }),
        }}
        options={PERIOD_OPTIONS}
      />
    </>
  );
}

export function FilterRow({ filter, choices, results }: FilterRowProps): React.JSX.Element {
  const { value: filters, onChange } = filter;
  const { rows, needsReviewCount } = results;
  return (
    <div className="ds-row flex-wrap">
      <Segmented
        label="Direction"
        value={filters.direction}
        options={DIRECTIONS}
        onChange={(direction) => {
          onChange({ direction });
          trackAction('ui:filter');
        }}
      />
      <FilterMenus filter={filter} choices={choices} />
      <Chip
        role="switch"
        aria-checked={filters.needsReviewOnly}
        tone={filters.needsReviewOnly ? 'accent' : 'neutral'}
        onClick={() => onChange({ needsReviewOnly: !filters.needsReviewOnly })}
      >
        Needs review · {needsReviewCount}
      </Chip>
      {filters.search && (
        <Button size="sm" variant="ghost" onClick={() => onChange({ search: '' })}>
          Search: {filters.search} <X aria-label="Clear search" size={12} />
        </Button>
      )}
      {rows.length > 0 && <Totals rows={rows} />}
    </div>
  );
}
