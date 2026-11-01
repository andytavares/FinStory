import { RefreshCw } from 'lucide-react';
import { Chip } from './ui';

/** Marks a transaction as part of a recurring charge. */
export function RecurringChip(): React.JSX.Element {
  return (
    <span title="Part of a recurring charge">
      <Chip>
        <RefreshCw aria-hidden className="h-3 w-3" />
        Recurring
      </Chip>
    </span>
  );
}
