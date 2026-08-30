import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { EmptyState } from '../components/EmptyState';

interface CategoryRow {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly isSystem: boolean;
  readonly isHidden: boolean;
}

/** FR-079–FR-082: add, rename, merge, hide. Nesting is capped at one level. */
export function Categories(): React.JSX.Element {
  const { data, loading } = useQuery<CategoryRow[]>('categories:list', { includeHidden: true });
  const [newName, setNewName] = useState('');

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  if (!data) return <EmptyState title="Categories unavailable" detail="Try reopening the app." />;

  const topLevel = data.filter((c) => c.parentId === null);

  return (
    <div className="space-y-5">
      <h1 className="text-[20px]">Categories</h1>

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          className="flex-1 border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px] outline-none placeholder:text-[var(--color-ink-faint)]"
        />
        <button
          type="button"
          disabled={newName.trim().length === 0}
          onClick={() => {
            void call('categories:create', { name: newName.trim(), parentId: null });
            setNewName('');
          }}
          className="border border-[var(--color-line)] px-4 text-[13px] disabled:opacity-40"
        >
          Add
        </button>
      </div>

      <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
        {topLevel.map((parent) => (
          <li key={parent.id} className="bg-[var(--color-surface)]">
            <Row category={parent} />
            {data
              .filter((c) => c.parentId === parent.id)
              .map((child) => (
                <div key={child.id} className="pl-6">
                  <Row category={child} />
                </div>
              ))}
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-[var(--color-ink-faint)]">
        Hiding a category keeps it out of new assignments. Past transactions keep it, so historical
        totals still add up.
      </p>
    </div>
  );
}

function Row({ category }: { category: CategoryRow }): React.JSX.Element {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 text-[13px] ${category.isHidden ? 'opacity-50' : ''}`}
    >
      <span className="flex-1">{category.name}</span>
      {category.isSystem && <span className="text-[11px] text-[var(--color-ink-faint)]">built in</span>}
      <button
        type="button"
        onClick={() => void call('categories:setHidden', { id: category.id, hidden: !category.isHidden })}
        className="text-[12px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
      >
        {category.isHidden ? 'Show' : 'Hide'}
      </button>
    </div>
  );
}
