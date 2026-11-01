import { useEffect, useState } from 'react';
import { call } from '../lib/ipc';
import { Button, ProgressBar, Segmented } from './ui';

interface RecategorizeResult {
  readonly message: string;
  readonly changed: number;
}

interface Progress {
  readonly processed: number;
  readonly total: number;
  readonly changed: number;
  readonly done: boolean;
  readonly cancelled?: boolean;
  readonly message?: string;
}

/**
 * Re-run categorization over what is already stored.
 *
 * The model only ever runs at ingestion, so anything imported before one was
 * configured stays on merchant patterns forever. This is the way back.
 *
 * A run is one model call per transaction and can take minutes, so it reports
 * where it is and can be stopped. Stopping keeps everything already done.
 */
export function RecategorizeButton({
  onDone,
  variant = 'card',
}: {
  onDone?: () => void;
  /** `compact`: page-header button, unresolved only, status as caption. `card`: Settings scope switch, "Run" and progress bar. */
  variant?: 'card' | 'compact';
}): React.JSX.Element {
  const compact = variant === 'compact';
  const [scope, setScope] = useState<'unresolved' | 'all'>('unresolved');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [stopping, setStopping] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    return window.money.on('categorization:progress', (payload) => {
      const p = payload as Progress;
      setProgress(p.done ? null : p);
    });
  }, []);

  const run = async (): Promise<void> => {
    setBusy(true);
    setStopping(false);
    setNote(null);
    try {
      const result = await call<RecategorizeResult>('categorization:rerun', { scope });
      setNote(result.message);
      onDone?.();
    } catch (e) {
      setNote((e as { message?: string }).message ?? 'Recategorizing failed.');
    } finally {
      setBusy(false);
      setProgress(null);
      setStopping(false);
    }
  };

  const stop = async (): Promise<void> => {
    setStopping(true);
    await call('categorization:cancel');
  };

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : 0;

  const label = compact ? 'Sort these with AI' : 'Run';
  const busyLabel = 'Sorting…';
  const status = progress
    ? `${progress.processed} of ${progress.total} · ${progress.changed} recategorized${stopping ? ' · finishing the one in flight' : ''}`
    : null;

  return (
    <div className={compact ? 'ds-row' : 'space-y-2'}>
      {compact && status && <span className="ds-caption">{status}</span>}
      {compact && note && !progress && (
        <span role="status" className="ds-caption">
          {note}
        </span>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!compact && !busy && (
          <Segmented
            label="What to recategorize"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'unresolved', label: 'Unresolved only' },
              { value: 'all', label: 'Everything' },
            ]}
          />
        )}
        <Button onClick={() => void run()} disabled={busy}>
          {busy ? busyLabel : label}
        </Button>
        {busy && (
          <Button onClick={() => void stop()} disabled={stopping}>
            {stopping ? 'Stopping…' : 'Stop'}
          </Button>
        )}
      </div>

      {!compact && progress && (
        <div className="space-y-1">
          <ProgressBar value={pct / 100} label="Recategorization progress" />
          <p className="ds-caption">{status}</p>
        </div>
      )}

      {!compact && note && !progress && (
        <p role="status" className="ds-caption">
          {note}
        </p>
      )}
    </div>
  );
}
