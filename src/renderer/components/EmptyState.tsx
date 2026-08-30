/** An empty screen is an invitation to act, not a shrug. */
export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="border border-dashed border-[var(--color-line)] px-6 py-10 text-center">
      <p className="text-[15px] text-[var(--color-ink)]">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-[var(--color-ink-faint)]">{detail}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
