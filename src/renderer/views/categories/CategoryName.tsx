import { useState } from 'react';
import { call } from '../../lib/ipc';
import { TextInput } from '../../components/ui';
import type { CategoryRow, RenameState } from './types';

interface CategoryNameProps {
  readonly category: CategoryRow;
  readonly rename: RenameState;
  readonly onChanged: () => void;
}

/** Name text; while `editing`, an input that saves on Enter or blur. Ids are stable, so a rename is display-only. */
export function CategoryName({
  category,
  rename,
  onChanged,
}: CategoryNameProps): React.JSX.Element {
  const { editing, onDone } = rename;
  const [name, setName] = useState(category.name);
  if (!editing) return <span>{category.name}</span>;

  const save = (): void => {
    onDone();
    if (name.trim() && name.trim() !== category.name) {
      void call('categories:rename', { id: category.id, name: name.trim() }).then(onChanged);
    }
  };
  return (
    <TextInput
      autoFocus
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setName(category.name);
          onDone();
        }
        if (e.key === 'Enter') save();
      }}
      aria-label={`Name for ${category.name}`}
    />
  );
}
