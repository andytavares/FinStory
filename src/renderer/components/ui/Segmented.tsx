export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (next: T) => void;
  label?: string;
}): React.JSX.Element {
  return (
    <span className="ds-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}
