import { useState } from 'react';
import { Button, Card, Chip } from '../../components/ui';

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
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.value === value)?.label ?? anyLabel;
  const choose = (next: string | null): void => {
    onChange(next);
    setOpen(false);
  };
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="cursor-pointer border-0 bg-transparent p-0"
      >
        <Chip>
          {label ? `${label}: ${chosen}` : chosen} ▾
        </Chip>
      </button>
      {open && (
        <Card
          role="menu"
          className="absolute left-0 top-[26px] z-10 flex max-h-[280px] min-w-[190px] flex-col gap-1 overflow-y-auto"
        >
          <Button variant="ghost" size="sm" onClick={() => choose(null)}>
            {anyLabel}
          </Button>
          {options.map((o) => (
            <Button key={o.value} variant="ghost" size="sm" onClick={() => choose(o.value)}>
              {o.label}
            </Button>
          ))}
        </Card>
      )}
    </div>
  );
}
