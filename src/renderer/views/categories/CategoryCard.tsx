import { useState } from 'react';
import { call } from '../../lib/ipc';
import { spend } from '../../lib/format';
import { Button, Card, MerchantMark, TextInput } from '../../components/ui';
import { CategoryMenu } from './CategoryMenu';
import { CategoryName } from './CategoryName';
import type { CategoryRow, CategoryScope } from './types';

interface CardProps {
  readonly group: CategoryRow;
  readonly subcategories: readonly CategoryRow[];
  readonly scope: CategoryScope;
}

/** One top-level category with its subcategories, each with its own ⋯ menu. */
export function CategoryCard({ group, subcategories, scope }: CardProps): React.JSX.Element {
  const [renaming, setRenaming] = useState(false);
  const kind = group.isSystem ? 'Built in' : 'Custom';
  return (
    <Card className={group.isHidden ? 'opacity-50' : ''}>
      <div className="ds-row">
        <MerchantMark name={group.name} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            <CategoryName
              category={group}
              rename={{ editing: renaming, onDone: () => setRenaming(false) }}
              onChanged={scope.onChanged}
            />
          </div>
          <div className="ds-caption">
            {kind} · {subcategories.length} subcategories
          </div>
        </div>
        <span className="ds-num">{spend(group.rolledUpSpentMinor)}</span>
        <CategoryMenu category={group} scope={scope} onRename={() => setRenaming(true)} />
      </div>
      <div className="mt-1.5 pl-[34px]">
        {subcategories.map((child) => (
          <SubcategoryRow key={child.id} category={child} scope={scope} />
        ))}
        <AddSubcategory parent={group} onCreated={scope.onChanged} />
      </div>
    </Card>
  );
}

function SubcategoryRow({
  category,
  scope,
}: {
  category: CategoryRow;
  scope: CategoryScope;
}): React.JSX.Element {
  const [renaming, setRenaming] = useState(false);
  return (
    <div
      className={`group ds-row border-b border-[var(--color-line)] py-1 ${category.isHidden ? 'opacity-50' : ''}`}
    >
      <span className="ds-muted flex-1">
        <CategoryName
          category={category}
          rename={{ editing: renaming, onDone: () => setRenaming(false) }}
          onChanged={scope.onChanged}
        />
      </span>
      <span className="ds-num ds-faint">{spend(category.spentMinor)}</span>
      <div className="opacity-0 focus-within:opacity-100 group-hover:opacity-100">
        <CategoryMenu category={category} scope={scope} onRename={() => setRenaming(true)} />
      </div>
    </div>
  );
}

/** Inline subcategory creation, so a parent's children are added where they live. */
function AddSubcategory({
  parent,
  onCreated,
}: {
  parent: CategoryRow;
  onCreated: () => void;
}): React.JSX.Element {
  const { id: parentId, name: parentName } = parent;
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
      <div className="py-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          aria-label={`Add a subcategory under ${parentName}`}
        >
          + Subcategory
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1 py-1.5">
      <div className="ds-row">
        <TextInput
          autoFocus
          className="flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create();
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={`New subcategory under ${parentName}`}
          aria-label={`New subcategory under ${parentName}`}
        />
        <Button size="sm" onClick={create}>
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error && <p className="ds-warn text-[12px]">{error}</p>}
    </div>
  );
}
