import { Menu, MenuItem } from '../../components/ui';

export interface MenuOption {
  readonly value: string;
  readonly label: string;
}

/** A filter chip that opens a small menu of choices. `null` is the unfiltered state. */
export function FilterMenu({
  label,
  anyLabel,
  options,
  value,
  onChange,
}: {
  label: string;
  anyLabel: string;
  options: readonly MenuOption[];
  value: string | null;
  onChange: (next: string | null) => void;
}): React.JSX.Element {
  const chosen = options.find((o) => o.value === value)?.label ?? anyLabel;
  return (
    <Menu trigger={label ? `${label}: ${chosen}` : chosen}>
      {(close) => (
        <>
          {[{ value: null, label: anyLabel }, ...options].map((o) => (
            <MenuItem
              key={o.value ?? 'any'}
              onClick={() => {
                onChange(o.value);
                close();
              }}
            >
              {o.label}
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  );
}
