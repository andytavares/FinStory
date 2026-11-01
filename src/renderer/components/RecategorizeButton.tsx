import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { call } from '../lib/ipc';
import { Button, ProgressBar, Select } from './ui';

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
  compact = false,
}: {
  onDone?: () => void;
  /** For a page header: the "Sort these with AI" label, unresolved only, status as a caption. */
  compact?: boolean;
}): React.JSX.Element {
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

  const label = busy ? (compact ? 'Sorting…' : 'Recategorizing…') : compact ? 'Sort these with AI' : 'Recategorize with AI';
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
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void run()} disabled={busy}>
          <Sparkles aria-hidden className="h-4 w-4" />
          {label}
        </Button>
        {busy ? (
          <Button onClick={() => void stop()} disabled={stopping}>
            {stopping ? 'Stopping…' : 'Stop'}
          </Button>
        ) : (
          !compact && (
            <Select
              value={scope}
              onChange={(e) => setScope(e.target.value as 'unresolved' | 'all')}
              aria-label="What to recategorize"
            >
              <option value="unresolved">Only what is unresolved</option>
              <option value="all">Everything except my own corrections</option>
            </Select>
          )
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
