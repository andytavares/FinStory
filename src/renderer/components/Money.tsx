import { money, spend } from '../lib/format';

/**
 * Money always renders in tabular figures so columns align for comparison.
 *
 * `direction` distinguishes inflow from outflow with an explicit + / − sign as
 * well as colour. The sign is what carries the meaning; colour reinforces it.
 * Colour alone would fail for a colourblind reader and in print.
 */
export function Money({
  minor,
  magnitude = false,
  direction = false,
  className = '',
}: {
  minor: number;
  magnitude?: boolean;
  direction?: boolean;
  className?: string;
}): React.JSX.Element {
  if (!direction || minor === 0) {
    return <span className={`numeric ${className}`}>{magnitude ? spend(minor) : money(minor)}</span>;
  }

  const inflow = minor > 0;
  const color = inflow ? 'var(--color-positive)' : 'var(--color-ink)';
  return (
    <span className={`numeric ${className}`} style={{ color }}>
      <span aria-hidden>{inflow ? '+' : '−'}</span>
      {spend(minor)}
      <span className="sr-only">{inflow ? ' received' : ' spent'}</span>
    </span>
  );
}
