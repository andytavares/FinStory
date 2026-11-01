export interface NavListItem {
  readonly id: string;
  readonly label: string;
}

/** A vertical list of nav-styled buttons with one active item. */
export function NavList({
  items,
  active,
  onSelect,
  label,
}: {
  items: ReadonlyArray<NavListItem>;
  active: string;
  onSelect: (id: string) => void;
  label: string;
}): React.JSX.Element {
  return (
    <div role="group" aria-label={label} className="ds-navlist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="ds-nav"
          aria-current={active === item.id ? 'page' : undefined}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
