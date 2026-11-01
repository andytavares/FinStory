export function ProgressBar({
  value,
  color = 'var(--color-accent)',
  label,
}: {
  /** Fraction from 0 to 1. */
  value: number;
  color?: string;
  label: string;
}): React.JSX.Element {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className="ds-bar"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <i style={{ width: `${percent}%`, background: color }} />
    </div>
  );
}
