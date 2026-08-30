import { TriangleAlert } from 'lucide-react';

/**
 * Constitution IX / SC-014: an incomplete period is never presented as
 * complete. This banner is not optional decoration — any view showing a total
 * over a period with a stale feed must render it.
 */
export function Qualification({
  dataComplete,
  staleInstitutions,
}: {
  dataComplete: boolean;
  staleInstitutions: readonly string[];
}): React.JSX.Element | null {
  if (dataComplete) return null;
  const names = staleInstitutions.length > 0 ? staleInstitutions.join(', ') : 'one or more accounts';
  return (
    <div className="icon flex items-start gap-2 border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px] text-[var(--color-ink-muted)]">
      <TriangleAlert aria-hidden className="mt-px shrink-0 opacity-70" />
      <p>
        These figures are incomplete. Data from {names} was unavailable, so totals shown are lower
        bounds.
      </p>
    </div>
  );
}
