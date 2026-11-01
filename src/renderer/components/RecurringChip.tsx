import { RefreshCw } from 'lucide-react';
import { Chip } from './ui';

/** Marks a transaction as part of a recurring charge. */
export function RecurringChip(): React.JSX.Element {
  return (
    <Chip size="sm" title="Part of a recurring charge">
      <RefreshCw aria-hidden className="h-3 w-3" />
      Recurring
    </Chip>
  );
}
