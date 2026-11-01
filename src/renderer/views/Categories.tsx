import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { EmptyState } from '../components/EmptyState';
import { Button, Card, PageHeader, TextInput } from '../components/ui';
import { CategoryCard } from './categories/CategoryCard';
import type { CategoryRow } from './categories/types';

const byName = (a: CategoryRow, b: CategoryRow): number => a.name.localeCompare(b.name);

/** FR-079–FR-082: add, rename, merge, hide. Nesting is capped at one level. */
export function Categories(): React.JSX.Element {
  const { data, loading, refetch } = useQuery<CategoryRow[]>('categories:list', {
    includeHidden: true,
  });
  const [creating, setCreating] = useState(false);

  if (loading) return <p className="ds-faint">Loading…</p>;
  if (!data) return <EmptyState title="Categories unavailable" detail="Try reopening the app." />;

  const visible = data.filter((c) => c.mergedIntoId === null);
  const groups = visible.filter((c) => c.parentId === null).sort(byName);
  const subcategoryCount = visible.length - groups.length;

  return (
    <>
      <PageHeader
        title="Categories"
        sub={`${groups.length} groups · ${subcategoryCount} subcategories`}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            + New category
          </Button>
        }
      />
      {creating && (
        <NewCategory
          onDone={() => {
            setCreating(false);
            refetch();
          }}
          onCancel={() => setCreating(false)}
        />
      )}
      <div className="ds-grid grid-cols-2">
        {groups.map((group) => (
          <CategoryCard
            key={group.id}
            group={group}
            subcategories={visible.filter((c) => c.parentId === group.id).sort(byName)}
            allCategories={visible}
            onChanged={refetch}
          />
        ))}
      </div>
      <p className="ds-caption">
        Hiding a category keeps it out of new assignments. Past transactions keep it, so historical
        totals still add up. Subcategories go one level deep.
      </p>
    </>
  );
}

function NewCategory({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }): React.JSX.Element {
  const [name, setName] = useState('');
  const add = (): void => {
    if (!name.trim()) return;
    void call('categories:create', { name: name.trim(), parentId: null }).then(onDone);
    setName('');
  };
  return (
    <Card>
      <div className="ds-row">
        <TextInput
          autoFocus
          className="flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="New top-level category"
          aria-label="New top-level category"
        />
        <Button variant="primary" disabled={name.trim().length === 0} onClick={add}>Add</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  );
}
