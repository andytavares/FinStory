export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly title?: React.ReactNode;
  readonly caption?: React.ReactNode;
  readonly actions?: React.ReactNode;
  /** `danger` draws a red border, for destructive actions. */
  readonly tone?: 'default' | 'danger';
  /** Accent ring and glow, for the chosen option in a set. */
  readonly selected?: boolean;
}

export function Card({
  title,
  caption,
  actions,
  tone = 'default',
  selected = false,
  className = '',
  children,
  ...rest
}: CardProps): React.JSX.Element {
  const hasHeader = title || caption || actions;
  const classes = [
    'ds-card',
    tone === 'danger' ? 'ds-card-danger' : '',
    selected ? 'ds-card-selected' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} {...rest}>
      {hasHeader && (
        <div className="ds-card-head">
          {title && <h3 className="ds-card-title">{title}</h3>}
          {caption && <span className="ds-caption ml-auto">{caption}</span>}
          {actions && <div className="ml-auto flex gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
