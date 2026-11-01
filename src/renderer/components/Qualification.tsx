import { Button, Chip } from './ui';

/**
 * Constitution IX / SC-014: an incomplete period is never presented as
 * complete. This chip is not optional decoration — any view showing a total
 * over a period with a stale feed must render it.
 */
export function Qualification({
  dataComplete,
  staleInstitutions,
  onReconnect,
}: {
  dataComplete: boolean;
  staleInstitutions: readonly string[];
  /** Shown as a Reconnect action when an institution needs sign-in. */
  onReconnect?: (() => void) | undefined;
}): React.JSX.Element | null {
  if (dataComplete) return null;
  const names = staleInstitutions.length > 0 ? staleInstitutions.join(', ') : 'one or more accounts';
  return (
    <div style={{ alignSelf: 'flex-start' }}>
      <Chip tone="warn">
        <span>
          {onReconnect && staleInstitutions.length > 0
            ? `${names} needs you to sign in again. Totals below miss its charges.`
            : `These figures are incomplete. Data from ${names} was unavailable, so totals shown are lower bounds.`}
        </span>
        {onReconnect && staleInstitutions.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onReconnect}>
            Reconnect
          </Button>
        )}
      </Chip>
    </div>
  );
}
