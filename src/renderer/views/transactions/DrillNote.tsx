import { Button } from '../../components/ui';

/** The dashboard counts day-to-day spending; the rest of the category is listed too, with the reason and a way to narrow. */
interface DrillNoteProps {
  readonly spendingOnly: boolean;
  readonly shownAll: number;
  readonly onChange: (next: boolean) => void;
}

export function DrillNote({ spendingOnly, shownAll, onChange }: DrillNoteProps): React.JSX.Element {
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
