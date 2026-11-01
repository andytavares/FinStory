import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Money } from './Money';
import { categoryColor } from '../lib/categoryColor';

export interface BreakdownRow {
  readonly categoryId: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly parentName: string | null;
  readonly totalMinor: number;
  /** Every transaction in the category. */
  readonly txCount: number;
  /** The subset the amount was built from. */
  readonly countedCount?: number;
  /** In this category but left out of the spending figure. */
  readonly uncountedCount?: number;
}

interface Group {
  readonly id: string;
  readonly name: string;
  readonly totalMinor: number;
  readonly txCount: number;
  readonly countedCount: number;
  readonly children: BreakdownRow[];
  /** Spending recorded on the parent itself, not one of its children. */
  readonly ownMinor: number;
  /**
   * How many transactions sit directly on the parent.
   *
   * Counted separately from the amount: transactions that net to zero are still
   * transactions, and hiding the row when the total happens to be zero means
   * there is no way to reach them.
   */
  readonly ownCount: number;
  /** Of those, how many the amount was built from. */
  readonly ownCounted: number;
}

/**
 * Roll a flat breakdown up to parent categories.
 *
 * A row whose parent is unknown (renamed away, deleted) becomes its own group
 * rather than disappearing — the totals must still reconcile.
 */
export function groupByParent(rows: readonly BreakdownRow[]): Group[] {
  const groups = new Map<string, Group>();

  for (const row of rows) {
    const id = row.parentId ?? row.categoryId;
    const name = row.parentId ? (row.parentName ?? row.parentId) : row.name;
    const existing = groups.get(id) ?? {
      id,
      name,
      totalMinor: 0,
      txCount: 0,
      countedCount: 0,
      children: [],
      ownMinor: 0,
      ownCount: 0,
      ownCounted: 0,
    };
    groups.set(id, {
      ...existing,
      name: existing.name || name,
      totalMinor: existing.totalMinor + row.totalMinor,
      txCount: existing.txCount + row.txCount,
      countedCount: existing.countedCount + (row.countedCount ?? row.txCount),
      children: row.parentId ? [...existing.children, row] : existing.children,
      ownMinor: row.parentId ? existing.ownMinor : existing.ownMinor + row.totalMinor,
      ownCount: row.parentId ? existing.ownCount : existing.ownCount + row.txCount,
      ownCounted: row.parentId
        ? existing.ownCounted
        : existing.ownCounted + (row.countedCount ?? row.txCount),
    });
  }

  return [...groups.values()]
    .map((g) => ({ ...g, children: [...g.children].sort((a, b) => a.totalMinor - b.totalMinor) }))
    .sort((a, b) => a.totalMinor - b.totalMinor);
}

/**
 * What the two numbers on a row mean.
 *
 * The count is every transaction in the category, because that is what a reader
 * takes it to mean. The amount is spending only, so when the two disagree the
 * difference has to be stated rather than left as an apparent contradiction.
 */
function countTitle(total: number, counted: number | undefined): string {
  const inTotal = counted ?? total;
  if (inTotal === total) return `${total} transactions, all counted in this amount`;
  return `${total} transactions · ${inTotal} counted in this amount, ${total - inTotal} not (money in, transfers, exclusions, or accounts not marked day-to-day)`;
}

/** Spending by parent category, expandable to its subcategories. */
export function CategoryTree({
  rows,
  onDrill,
}: {
  rows: readonly BreakdownRow[];
  onDrill: (categoryId: string) => void;
}): React.JSX.Element {
  const groups = groupByParent(rows);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const largest = Math.min(...groups.map((g) => g.totalMinor), -1);

  const toggle = (id: string): void => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  return (
    <ul className="m-0 mt-2 list-none divide-y divide-[var(--color-line)] p-0">
      {groups.map((group, index) => {
        const isOpen = expanded.has(group.id);
        const hasChildren = group.children.length > 0;
        return (
          <li key={group.id}>
            <div className="flex items-center bg-[var(--color-surface)]">
              <button
                type="button"
                onClick={() => (hasChildren ? toggle(group.id) : onDrill(group.id))}
                aria-expanded={hasChildren ? isOpen : undefined}
                aria-label={hasChildren ? `Expand ${group.name}` : `View ${group.name}`}
                className="icon flex flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-[var(--color-surface-raised)]"
              >
                <span className="w-4 shrink-0 text-[var(--color-ink-faint)]">
                  {hasChildren ? (
                    isOpen ? (
                      <ChevronDown aria-hidden />
                    ) : (
                      <ChevronRight aria-hidden />
                    )
                  ) : null}
                </span>
                <span className="w-40 shrink-0 truncate text-[13px]">{group.name}</span>
                <span className="h-1 flex-1 rounded-full bg-[var(--color-surface-raised)]">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(group.totalMinor / largest) * 100}%`,
                      background: categoryColor(index),
                    }}
                  />
                </span>
                <Money minor={group.totalMinor} magnitude className="w-28 text-right text-[13px]" />
                <span
                  className="numeric w-10 text-right text-[12px] text-[var(--color-ink-faint)]"
                  title={countTitle(group.txCount, group.countedCount)}
                >
                  {group.txCount}
                </span>
              </button>
            </div>

            {isOpen &&
              group.children.map((child) => (
                <button
                  key={child.categoryId}
                  type="button"
                  onClick={() => onDrill(child.categoryId)}
                  className="flex w-full items-center gap-3 border-t border-[var(--color-line)] bg-[var(--color-ground)] px-4 py-2 pl-11 text-left hover:bg-[var(--color-surface)]"
                >
                  <span className="w-40 shrink-0 truncate text-[13px] text-[var(--color-ink-muted)]">
                    {child.name}
                  </span>
                  <span className="flex-1" />
                  <Money
                    minor={child.totalMinor}
                    magnitude
                    className="w-28 text-right text-[13px] text-[var(--color-ink-muted)]"
                  />
                  <span
                    className="numeric w-10 text-right text-[12px] text-[var(--color-ink-faint)]"
                    title={countTitle(child.txCount, child.countedCount)}
                  >
                    {child.txCount}
                  </span>
                </button>
              ))}

            {isOpen && group.ownCount > 0 && (
              // Spending sitting on the parent itself is a real set of
              // transactions, so it drills like any other row.
              <button
                type="button"
                onClick={() => onDrill(group.id)}
                aria-label={`View transactions directly in ${group.name}`}
                className="flex w-full items-center gap-3 border-t border-[var(--color-line)] bg-[var(--color-ground)] px-4 py-2 pl-11 text-left text-[13px] text-[var(--color-ink-faint)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink-muted)]"
              >
                <span className="w-40 shrink-0 truncate">Directly in {group.name}</span>
                <span className="flex-1" />
                <Money minor={group.ownMinor} magnitude className="w-28 text-right" />
                <span
                  className="numeric w-10 text-right text-[12px]"
                  title={countTitle(group.ownCount, group.ownCounted)}
                >
                  {group.ownCount}
                </span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
