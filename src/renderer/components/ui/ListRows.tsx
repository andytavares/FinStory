/** A list of rows with line separators, for use inside a Card (the mock's `.m-list`). */
export function ListRows({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="ds-list">{children}</div>;
}

export function ListRow({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="ds-list-row">{children}</div>;
}
