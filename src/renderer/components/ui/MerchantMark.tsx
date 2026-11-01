import { categoryColor } from '../../lib/categoryColor';

/** Lettered rounded badge; the colour is stable for a given name. */
export function MerchantMark({ name }: { name: string }): React.JSX.Element {
  return (
    <span className="ds-logo" style={{ background: categoryColor(name) }} aria-hidden>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
