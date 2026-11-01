import { Card } from './ui';

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
    <Card className="!border-dashed px-6 py-10 text-center">
      <p className="text-[15px] text-[var(--color-ink)]">{title}</p>
      <p className="ds-faint mx-auto mt-1 max-w-md text-[13px]">{detail}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </Card>
  );
}
