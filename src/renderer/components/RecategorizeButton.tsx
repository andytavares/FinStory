import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { call } from '../lib/ipc';

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
export function RecategorizeButton({ onDone }: { onDone?: () => void }): React.JSX.Element {
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="flex items-center gap-2 border border-[var(--color-line)] px-3 py-2 text-[13px] hover:bg-[var(--color-surface-raised)] disabled:opacity-50 [&>svg]:h-4 [&>svg]:w-4"
        >
          <Sparkles aria-hidden />
          {busy ? 'Recategorizing…' : 'Recategorize with AI'}
        </button>
        {busy ? (
          <button
            type="button"
            onClick={() => void stop()}
            disabled={stopping}
            className="border border-[var(--color-line)] px-3 py-2 text-[13px] hover:bg-[var(--color-surface-raised)] disabled:opacity-50"
          >
            {stopping ? 'Stopping…' : 'Stop'}
          </button>
        ) : (
          <label className="text-[12px] text-[var(--color-ink-faint)]">
            <span className="sr-only">What to recategorize</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as 'unresolved' | 'all')}
              aria-label="What to recategorize"
              className="border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-2 text-[12px]"
            >
              <option value="unresolved">Only what is unresolved</option>
              <option value="all">Everything except my own corrections</option>
            </select>
          </label>
        )}
      </div>

      {progress && (
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-valuenow={progress.processed}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-label="Recategorization progress"
            className="h-1 w-full bg-[var(--color-surface-raised)]"
          >
            {/* The validated data hue, not a reserved status colour. */}
            <div className="h-full bg-[#4897cd]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[12px] text-[var(--color-ink-faint)]">
            {progress.processed} of {progress.total} · {progress.changed} recategorized
            {stopping && ' · finishing the one in flight'}
          </p>
        </div>
      )}

      {note && !progress && (
        <p role="status" className="text-[12px] text-[var(--color-ink-faint)]">
          {note}
        </p>
      )}
    </div>
  );
}
