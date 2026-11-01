export function Table({
  className = '',
  ...rest
}: React.TableHTMLAttributes<HTMLTableElement>): React.JSX.Element {
  return <table className={`ds-table ${className}`.trim()} {...rest} />;
}
