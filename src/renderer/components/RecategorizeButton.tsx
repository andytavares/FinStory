import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { call } from '../lib/ipc';

interface RecategorizeResult {
  readonly message: string;
  readonly changed: number;
}

/**
 * Re-run categorization over what is already stored.
 *
 * The model only ever runs at ingestion, so anything imported before one was
 * configured stays on merchant patterns forever. This is the way back.
 */
export function RecategorizeButton({
  onDone,
}: {
  onDone?: () => void;
}): React.JSX.Element {
  const [scope, setScope] = useState<'unresolved' | 'all'>('unresolved');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async (): Promise<void> => {
    setBusy(true);
    setNote(null);
    try {
      const result = await call<RecategorizeResult>('categorization:rerun', { scope });
      setNote(result.message);
      onDone?.();
    } catch (e) {
      setNote((e as { message?: string }).message ?? 'Recategorizing failed.');
    } finally {
      setBusy(false);
    }
  };

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
        <label className="text-[12px] text-[var(--color-ink-faint)]">
          <span className="sr-only">What to recategorize</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'unresolved' | 'all')}
            disabled={busy}
            aria-label="What to recategorize"
            className="border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-2 text-[12px]"
          >
            <option value="unresolved">Only what is unresolved</option>
            <option value="all">Everything except my own corrections</option>
          </select>
        </label>
      </div>
      {note && (
        <p role="status" className="text-[12px] text-[var(--color-ink-faint)]">
          {note}
        </p>
      )}
    </div>
  );
}
