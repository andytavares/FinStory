export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  readonly title?: React.ReactNode;
  readonly caption?: React.ReactNode;
  readonly actions?: React.ReactNode;
}

export function Card({
  title,
  caption,
  actions,
  className = '',
  children,
  ...rest
}: CardProps): React.JSX.Element {
  const hasHeader = title || caption || actions;
  return (
    <div className={`ds-card ${className}`.trim()} {...rest}>
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
