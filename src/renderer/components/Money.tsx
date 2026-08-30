import { money, spend } from '../lib/format';

/** Money always renders in tabular figures so columns align for comparison. */
export function Money({
  minor,
  magnitude = false,
  className = '',
}: {
  minor: number;
  magnitude?: boolean;
  className?: string;
}): React.JSX.Element {
  return <span className={`numeric ${className}`}>{magnitude ? spend(minor) : money(minor)}</span>;
}
