import { useState } from 'react';
import { call } from '../../lib/ipc';
import { shortDate } from '../../lib/format';
import { Button, Card, Field, TextInput } from '../../components/ui';
import { MIN_PASSPHRASE_LENGTH } from '@shared/schemas';

const BACKUP_ACTIONS = {
  export: { label: 'Back up', channel: 'data:export', pathKey: 'destPath' },
  import: { label: 'Restore', channel: 'data:import', pathKey: 'srcPath' },
} as const;

type Action = keyof typeof BACKUP_ACTIONS;

/** Back up and Restore, each asking for the passphrase that locks the backup's key. */
export function BackupCard({
  lastBackupAt,
  onDone,
}: {
  lastBackupAt: string | null;
  onDone: () => void;
}): React.JSX.Element {
  const [action, setAction] = useState<Action | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const run = (): void => {
    if (!action) return;
    const { channel, pathKey } = BACKUP_ACTIONS[action];
    setMessage(null);
    void call(channel, { [pathKey]: '', passphrase })
      .then(() => {
        setAction(null);
        setPassphrase('');
        setMessage(action === 'export' ? 'Backup saved.' : null);
        onDone();
      })
      .catch((e: { message?: string }) => setMessage(e.message ?? 'That did not work'));
  };

  return (
    <Card>
      <div className="ds-row">
        <div className="flex-1">
          <div className="font-semibold">Backups</div>
          <div className="ds-caption">
            Last backup: {lastBackupAt ? shortDate(lastBackupAt) : 'never'}. A backup is the only
            copy if this Mac is lost.
          </div>
        </div>
        <Button onClick={() => setAction('import')}>Restore…</Button>
        <Button variant="primary" onClick={() => setAction('export')}>
          Back up now
        </Button>
      </div>
      {action && (
        <div className="mt-3 space-y-2">
          <Field
            label={
              action === 'export'
                ? `Choose a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters. You need it to restore this backup on any Mac.`
                : 'Enter the passphrase this backup was made with'
            }
          >
            <TextInput
              autoFocus
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              aria-label="Backup passphrase"
            />
          </Field>
          <div className="flex gap-2">
            <Button disabled={passphrase.length < MIN_PASSPHRASE_LENGTH} onClick={run}>
              {BACKUP_ACTIONS[action].label}
            </Button>
            <Button variant="ghost" onClick={() => setAction(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {message && <p className="ds-caption mt-2">{message}</p>}
    </Card>
  );
}
