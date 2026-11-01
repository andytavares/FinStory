import { categoryColor } from '../../lib/categoryColor';

/** Lettered rounded badge; the colour is stable for a given name unless `color` is given. */
export function MerchantMark({
  name,
  color = categoryColor(name),
}: {
  name: string;
  color?: string;
}): React.JSX.Element {
  return (
    <span className="ds-logo" style={{ background: color }} aria-hidden>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
