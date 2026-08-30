import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { EmptyState } from '../components/EmptyState';

interface CategoryRow {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly isSystem: boolean;
  readonly isHidden: boolean;
  readonly mergedIntoId: string | null;
}

/** FR-079–FR-082: add, rename, merge, hide. Nesting is capped at one level. */
export function Categories(): React.JSX.Element {
  const { data, loading, refetch } = useQuery<CategoryRow[]>('categories:list', {
    includeHidden: true,
  });
  const [newName, setNewName] = useState('');

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  if (!data) return <EmptyState title="Categories unavailable" detail="Try reopening the app." />;

  const visible = data.filter((c) => c.mergedIntoId === null);
  const topLevel = visible.filter((c) => c.parentId === null);

  const add = (): void => {
    if (!newName.trim()) return;
    void call('categories:create', { name: newName.trim(), parentId: null }).then(refetch);
    setNewName('');
  };

  return (
    <div className="space-y-5">
      <h1 className="text-[20px]">Categories</h1>

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
          placeholder="New top-level category"
          aria-label="New top-level category"
          className="flex-1 border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px] outline-none placeholder:text-[var(--color-ink-faint)]"
        />
        <button
          type="button"
          disabled={newName.trim().length === 0}
          onClick={add}
          className="border border-[var(--color-line)] px-4 text-[13px] disabled:opacity-40"
        >
          Add
        </button>
      </div>

      <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
        {topLevel.map((parent) => (
          <li key={parent.id} className="bg-[var(--color-surface)]">
            <Row category={parent} allCategories={visible} onChanged={refetch} />
            {visible
              .filter((c) => c.parentId === parent.id)
              .map((child) => (
                <div key={child.id} className="border-t border-[var(--color-line)] pl-6">
                  <Row category={child} allCategories={visible} onChanged={refetch} />
                </div>
              ))}
            <AddSubcategory parentId={parent.id} parentName={parent.name} onCreated={refetch} />
          </li>
        ))}
      </ul>

      <p className="text-[12px] text-[var(--color-ink-faint)]">
        Hiding a category keeps it out of new assignments. Past transactions keep it, so historical
        totals still add up. Subcategories go one level deep.
      </p>
    </div>
  );
}

/** Inline subcategory creation, so a parent's children are added where they live. */
function AddSubcategory({
  parentId,
  parentName,
  onCreated,
}: {
  parentId: string;
  parentName: string;
  onCreated: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = (): void => {
    if (!name.trim()) return;
    void call('categories:create', { name: name.trim(), parentId })
      .then(() => {
        setName('');
        setOpen(false);
        setError(null);
        onCreated();
      })
      .catch((e: { message?: string }) => setError(e.message ?? 'Could not add that'));
  };

  if (!open) {
    return (
      <div className="border-t border-[var(--color-line)] pl-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-4 py-2 text-[12px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        >
          + Add subcategory
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1 border-t border-[var(--color-line)] px-4 py-2 pl-6">
      <div className="flex gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create();
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={`New subcategory under ${parentName}`}
          aria-label={`New subcategory under ${parentName}`}
          className="flex-1 border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[13px] outline-none"
        />
        <button
          type="button"
          onClick={create}
          className="border border-[var(--color-line)] px-3 text-[12px]"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-2 text-[12px] text-[var(--color-ink-faint)]"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-[12px] text-[var(--color-attention)]">{error}</p>}
    </div>
  );
}

function Row({
  category,
  allCategories,
  onChanged,
}: {
  category: CategoryRow;
  allCategories: readonly CategoryRow[];
  onChanged: () => void;
}): React.JSX.Element {
  const [name, setName] = useState(category.name);
  const [merging, setMerging] = useState(false);

  const mergeTargets = allCategories.filter((c) => c.id !== category.id);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 text-[13px] ${category.isHidden ? 'opacity-50' : ''}`}
    >
      {/* Renaming is display-only: ids are stable, so comparisons survive it. */}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name.trim() && name !== category.name) {
            void call('categories:rename', { id: category.id, name: name.trim() }).then(onChanged);
          }
        }}
        aria-label={`Name for ${category.name}`}
        className="flex-1 border border-transparent bg-transparent px-1 py-0.5 outline-none hover:border-[var(--color-line)] focus:border-[var(--color-line)]"
      />
      {category.isSystem && (
        <span className="text-[11px] text-[var(--color-ink-faint)]">built in</span>
      )}

      {merging ? (
        <select
          autoFocus
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) {
              void call('categories:merge', {
                sourceId: category.id,
                targetId: e.target.value,
              }).then(onChanged);
            }
            setMerging(false);
          }}
          aria-label={`Merge ${category.name} into`}
          className="border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[12px]"
        >
          <option value="">Merge into…</option>
          {mergeTargets.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : (
        <button
          type="button"
          onClick={() => setMerging(true)}
          className="text-[12px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        >
          Merge
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          void call('categories:setHidden', {
            id: category.id,
            hidden: !category.isHidden,
          }).then(onChanged);
        }}
        className="text-[12px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
      >
        {category.isHidden ? 'Show' : 'Hide'}
      </button>
    </div>
  );
}
