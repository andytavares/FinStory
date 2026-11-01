/** A divided list of rows inside a Card; the design system has no list component yet. */
export function ListRows({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="flex flex-col divide-y divide-[var(--color-line)]">{children}</div>;
}

export function ListRow({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="flex items-center gap-3 py-2.5">{children}</div>;
}
