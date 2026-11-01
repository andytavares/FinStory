import { useState } from 'react';
import { call } from '../../lib/ipc';
import { Button, Menu, MenuItem, Select } from '../../components/ui';
import type { CategoryRow } from './types';

type Panel = 'list' | 'merge' | 'delete';

interface MenuProps {
  readonly category: CategoryRow;
  readonly allCategories: readonly CategoryRow[];
  readonly onChanged: () => void;
  readonly onRename: () => void;
}

const byName = (a: CategoryRow, b: CategoryRow): number => a.name.localeCompare(b.name);

/** The ⋯ menu: Rename, Merge, Hide or Show, Delete (with a destination when the category is in use). */
export function CategoryMenu({
  category,
  allCategories,
  onChanged,
  onRename,
}: MenuProps): React.JSX.Element {
  const [panel, setPanel] = useState<Panel>('list');
  const [error, setError] = useState<string | null>(null);
  const others = allCategories.filter((c) => c.id !== category.id).sort(byName);

  const reset = (): void => {
    setPanel('list');
    setError(null);
  };
  const run = (promise: Promise<unknown>, close: () => void): void => {
    promise
      .then(() => {
        close();
        onChanged();
      })
      .catch((e: { message?: string }) => setError(e.message ?? 'Could not do that'));
  };
  const remove = (close: () => void): void => {
    if (category.needsReassignment) setPanel('delete');
    else run(call('categories:delete', { id: category.id }), close);
  };

  return (
    <Menu kind="button" align="right" label={`Actions for ${category.name}`} trigger="⋯" onClose={reset}>
      {(close) => (
        <>
          {panel === 'list' && (
            <>
              <MenuItem onClick={() => { close(); onRename(); }}>Rename</MenuItem>
              <MenuItem aria-label={`Merge ${category.name}`} onClick={() => setPanel('merge')}>
                Merge
              </MenuItem>
              <MenuItem onClick={() => run(call('categories:setHidden', { id: category.id, hidden: !category.isHidden }), close)}>
                {category.isHidden ? 'Show' : 'Hide'}
              </MenuItem>
              <MenuItem aria-label={`Delete ${category.name}`} onClick={() => remove(close)}>
                Delete
              </MenuItem>
            </>
          )}
          {panel === 'merge' && (
            <MergePanel category={category} others={others} onPick={(targetId) => run(call('categories:merge', { sourceId: category.id, targetId }), close)} onCancel={close} />
          )}
          {panel === 'delete' && (
            <DeletePanel category={category} others={others} onMove={(reassignToId) => run(call('categories:delete', { id: category.id, reassignToId }), close)} onCancel={close} />
          )}
          {error && <p className="ds-warn px-1 text-[12px]">{error}</p>}
        </>
      )}
    </Menu>
  );
}

function MergePanel({
  category,
  others,
  onPick,
  onCancel,
}: {
  category: CategoryRow;
  others: readonly CategoryRow[];
  onPick: (targetId: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  return (
    <>
      <Select
        autoFocus
        defaultValue=""
        aria-label={`Merge ${category.name} into`}
        onChange={(e) => e.target.value && onPick(e.target.value)}
      >
        <option value="">Merge into…</option>
        {others.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </Select>
      <Button size="sm" onClick={onCancel}>Cancel</Button>
    </>
  );
}

function DeletePanel({
  category,
  others,
  onMove,
  onCancel,
}: {
  category: CategoryRow;
  others: readonly CategoryRow[];
  onMove: (reassignToId: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [moveTo, setMoveTo] = useState('');
  return (
    <>
      <p className="px-1 text-[12px]">
        {category.usageCount > 0 && (
          <>
            {category.usageCount} transaction{category.usageCount === 1 ? '' : 's'} use {category.name}.{' '}
          </>
        )}
        {category.childCount > 0 && (
          <>
            {category.childCount} subcategor{category.childCount === 1 ? 'y' : 'ies'} sit under it.{' '}
          </>
        )}
        Where should they go?
      </p>
      <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label={`Move contents of ${category.name} to`}>
        <option value="">Choose a category</option>
        {others.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </Select>
      <div className="flex gap-2">
        <Button size="sm" variant="danger" disabled={!moveTo} onClick={() => onMove(moveTo)}>
          Move and delete
        </Button>
        <Button size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </>
  );
}
