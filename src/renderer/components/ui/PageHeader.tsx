export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="ds-page-head">
      <h2>{title}</h2>
      {sub && <span className="ds-page-sub">{sub}</span>}
      {actions && <div className="ds-page-actions">{actions}</div>}
    </div>
  );
}
