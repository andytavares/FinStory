import { useState } from 'react';
import { call } from '../../lib/ipc';
import { Button, Card, Field, TextInput } from '../../components/ui';
import { DELETE_ALL_CONFIRMATION } from '@shared/schemas';

/** FR-048: erase everything and start over. The app restarts on the setup screen. */
export function ResetCard(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = (): void => {
    setError(null);
    void call('data:deleteAll', { confirmation: typed }).catch((e: { message?: string }) =>
      setError(e.message ?? 'Could not reset'),
    );
  };

  return (
    <Card tone="danger">
      <div className="ds-row">
        <div className="flex-1">
          <div className="font-semibold">Reset Money</div>
          <div className="ds-caption">
            Erase every account, transaction, rule and key on this Mac, then start over.
          </div>
        </div>
        {!open && (
          <Button variant="danger" onClick={() => setOpen(true)}>
            Reset everything…
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <p>It cannot be undone. Back up first if you want a copy.</p>
          <Field label={`Type ${DELETE_ALL_CONFIRMATION} to confirm`}>
            <TextInput
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label="Reset confirmation"
            />
          </Field>
          <div className="flex gap-2">
            <Button variant="danger" onClick={reset} disabled={typed !== DELETE_ALL_CONFIRMATION}>
              Erase and restart
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {error && <p className="ds-warn text-[12px]">{error}</p>}
        </div>
      )}
    </Card>
  );
}
