import { Menu, MenuItem } from '../../components/ui';

export interface MenuOption {
  readonly value: string;
  readonly label: string;
}

/** A filter chip that opens a small menu of choices. `null` is the unfiltered state. */
interface FilterMenuProps {
  /** `title` prefixes the trigger; `any` names the unfiltered choice. */
  readonly labels: { readonly title: string; readonly any: string };
  readonly options: readonly MenuOption[];
  readonly choice: { readonly value: string | null; readonly onChange: (next: string | null) => void };
}

export function FilterMenu({ labels, options, choice }: FilterMenuProps): React.JSX.Element {
  const { title: label, any: anyLabel } = labels;
  const { value, onChange } = choice;
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
