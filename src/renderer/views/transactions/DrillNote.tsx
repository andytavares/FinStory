import { Button } from '../../components/ui';

/**
 * The dashboard's count is spending in day-to-day accounts. Anything else in the
 * category is still listed, but narrowing to the dashboard's set is asked for and
 * the reason things were left out is stated.
 */
export function DrillNote({
  spendingOnly,
  shownAll,
  onChange,
}: {
  spendingOnly: boolean;
  shownAll: number;
  onChange: (next: boolean) => void;
}): React.JSX.Element {
  return (
    <p className="ds-caption">
      {spendingOnly
        ? 'Showing only what counted toward the spending total. '
        : 'Every transaction in this category. Spending totals leave out money in, transfers between your own accounts, anything you excluded, and accounts not marked day-to-day. '}
      <Button variant="ghost" size="sm" onClick={() => onChange(!spendingOnly)}>
        {spendingOnly ? `Show all ${shownAll}` : 'Show only what counted toward spending'}
      </Button>
    </p>
  );
}
