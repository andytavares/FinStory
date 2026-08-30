import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Money } from './Money';

export interface BreakdownRow {
  readonly categoryId: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly parentName: string | null;
  readonly totalMinor: number;
  readonly txCount: number;
}

interface Group {
  readonly id: string;
  readonly name: string;
  readonly totalMinor: number;
  readonly txCount: number;
  readonly children: BreakdownRow[];
  /** Spending recorded on the parent itself, not one of its children. */
  readonly ownMinor: number;
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
      children: [],
      ownMinor: 0,
    };
    groups.set(id, {
      ...existing,
      name: existing.name || name,
      totalMinor: existing.totalMinor + row.totalMinor,
      txCount: existing.txCount + row.txCount,
      children: row.parentId ? [...existing.children, row] : existing.children,
      ownMinor: row.parentId ? existing.ownMinor : existing.ownMinor + row.totalMinor,
    });
  }

  return [...groups.values()]
    .map((g) => ({ ...g, children: [...g.children].sort((a, b) => a.totalMinor - b.totalMinor) }))
    .sort((a, b) => a.totalMinor - b.totalMinor);
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
    <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
      {groups.map((group) => {
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
                <span className="h-1 flex-1 bg-[var(--color-surface-raised)]">
                  <span
                    className="block h-full bg-[var(--color-ink-faint)]"
                    style={{ width: `${(group.totalMinor / largest) * 100}%` }}
                  />
                </span>
                <Money minor={group.totalMinor} magnitude className="w-28 text-right text-[13px]" />
                <span className="numeric w-10 text-right text-[12px] text-[var(--color-ink-faint)]">
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
                  <span className="numeric w-10 text-right text-[12px] text-[var(--color-ink-faint)]">
                    {child.txCount}
                  </span>
                </button>
              ))}

            {isOpen && group.ownMinor !== 0 && (
              <div className="flex items-center gap-3 border-t border-[var(--color-line)] bg-[var(--color-ground)] px-4 py-2 pl-11 text-[13px] text-[var(--color-ink-faint)]">
                <span className="w-40 shrink-0 truncate">Directly in {group.name}</span>
                <span className="flex-1" />
                <Money minor={group.ownMinor} magnitude className="w-28 text-right" />
                <span className="w-10" />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
