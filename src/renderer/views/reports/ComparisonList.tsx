import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Chip, ListRow, ListRows } from '../../components/ui';
import { money, spend } from '../../lib/format';
import type { CategoryComparison } from './detailTypes';

/** Spending is negative, so a more-negative change means spending went up. */
function ChangeChip({ changeMinor }: { changeMinor: number }): React.JSX.Element {
  const tone = changeMinor === 0 ? 'neutral' : changeMinor < 0 ? 'bad' : 'ok';
  const text = changeMinor === 0 ? 'same' : `${changeMinor < 0 ? '↑' : '↓'} ${money(Math.abs(changeMinor))}`;
  return (
    <span className="inline-flex w-24 justify-center">
      <Chip tone={tone}>{text}</Chip>
    </span>
  );
}

interface Group {
  name: string;
  total: number;
  change: number;
  children: CategoryComparison[];
  own: CategoryComparison[];
}

function groupByParent(rows: readonly CategoryComparison[]): Array<[string, Group]> {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const id = row.parentId ?? row.categoryId;
    const name = row.parentId ? (row.parentName ?? row.parentId) : row.categoryName;
    const g = groups.get(id) ?? { name, total: 0, change: 0, children: [], own: [] };
    groups.set(id, {
      name: g.name || name,
      total: g.total + row.currentMinor,
      // The parent carries its subcategories' change, so a collapsed group
      // still says whether it moved.
      change: g.change + row.changeMinor,
      children: row.parentId ? [...g.children, row] : g.children,
      own: row.parentId ? g.own : [...g.own, row],
    });
  }
  return [...groups.entries()].sort((a, b) => a[1].total - b[1].total);
}

function GroupRow({ id, group }: { id: string; group: Group }): React.JSX.Element {
  const [isOpen, setOpen] = useState(false);
  const hasChildren = group.children.length > 0;
  return (
    <div>
      <button
        type="button"
        onClick={() => hasChildren && setOpen(!isOpen)}
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-label={hasChildren ? `Expand ${group.name}` : group.name}
        disabled={!hasChildren}
        className="icon flex w-full items-center gap-3 bg-transparent py-2.5 text-left text-[13px]"
      >
        <span className="w-4 shrink-0 text-[var(--color-ink-faint)]">
          {hasChildren ? isOpen ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden /> : null}
        </span>
        <span className="flex-1 truncate">{group.name}</span>
        <span className="ds-num">{spend(group.total)}</span>
        <ChangeChip changeMinor={group.change} />
      </button>
      {isOpen &&
        [...group.own, ...group.children].map((row) => (
          <ListRow key={row.categoryId}>
            <span className="ds-muted flex-1 truncate pl-7">
              {row.categoryId === id ? `Directly in ${group.name}` : row.categoryName}
            </span>
            <span className="ds-num">{spend(row.currentMinor)}</span>
            <ChangeChip changeMinor={row.changeMinor} />
          </ListRow>
        ))}
    </div>
  );
}

/** Parent categories with their subcategories, collapsible like the dashboard. */
export function ComparisonList({ rows }: { rows: readonly CategoryComparison[] }): React.JSX.Element {
  return (
    <ListRows>
      {groupByParent(rows).map(([id, group]) => (
        <GroupRow key={id} id={id} group={group} />
      ))}
    </ListRows>
  );
}
