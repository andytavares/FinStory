import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { RecategorizeButton } from '../components/RecategorizeButton';
import { Credentials } from '../components/Credentials';
import type { AppSettings, SetupStatus } from '@shared/types';
import { DELETE_ALL_CONFIRMATION, MIN_PASSPHRASE_LENGTH } from '@shared/schemas';

const ANTHROPIC_MODELS = [
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', note: 'Fastest, lowest cost' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', note: 'Balanced' },
  { id: 'claude-opus-5', label: 'Opus 5', note: 'Most capable' },
];

/** FR-061: the disclosure lives here, and the switch that governs it. */
interface OllamaModel {
  readonly name: string;
}

/**
 * Where categorization runs, and with which model.
 *
 * The three options differ in exactly one way that matters: what leaves this
 * machine. That is stated on each, not buried in a help page (FR-061).
 */
function ModelSection({ settings }: { settings: AppSettings }): React.JSX.Element {
  const [provider, setProvider] = useState(settings.modelProvider);
  const ollama = useQuery<OllamaModel[]>('models:listOllama');

  const update = (patch: Record<string, string>): void => {
    void call('settings:update', patch);
  };

  return (
    <section className="space-y-3">
      <p className="eyebrow">Categorization</p>

      <div className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
        {(
          [
            {
              id: 'anthropic',
              title: 'Claude',
              detail:
                'Best accuracy. Sends the merchant name, amount, date, and your category history for that one merchant. Never account numbers, balances, credentials, or totals.',
            },
            {
              id: 'ollama',
              title: 'Local model via Ollama',
              detail:
                'Nothing leaves this machine at all. Accuracy depends on the model you run; expect a larger review queue.',
            },
            {
              id: 'local_only',
              title: 'No model',
              detail:
                'Your own merchant history only. Fastest and most private, least accurate on merchants you have not seen before.',
            },
          ] as const
        ).map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer items-start gap-3 bg-[var(--color-surface)] px-4 py-3 text-[13px]"
          >
            <input
              type="radio"
              name="modelProvider"
              className="mt-1"
              checked={provider === option.id}
              onChange={() => {
                setProvider(option.id);
                update({ modelProvider: option.id });
              }}
            />
            <span>
              {option.title}
              <span className="mt-1 block text-[12px] text-[var(--color-ink-faint)]">
                {option.detail}
              </span>
            </span>
          </label>
        ))}
      </div>

      {provider === 'anthropic' && (
        <label className="block text-[13px]">
          <span className="text-[12px] text-[var(--color-ink-faint)]">Model</span>
          <select
            defaultValue={settings.anthropicModel}
            onChange={(e) => update({ anthropicModel: e.target.value })}
            className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px]"
          >
            {ANTHROPIC_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.note}
              </option>
            ))}
          </select>
        </label>
      )}

      {provider === 'anthropic' && (
        <label className="block text-[13px]">
          <span className="text-[12px] text-[var(--color-ink-faint)]">Workspace ID</span>
          <input
            defaultValue={settings.anthropicWorkspaceId}
            onChange={(e) => update({ anthropicWorkspaceId: e.target.value.trim() })}
            placeholder="Leave empty unless your key requires one"
            aria-label="Anthropic workspace ID"
            className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px]"
          />
          <span className="mt-1 block text-[12px] text-[var(--color-ink-faint)]">
            Only identity-linked keys need this. If yours does, requests fail with
            &ldquo;anthropic-workspace-id is required&rdquo; until it is set. Find it in the
            Anthropic Console URL when your workspace is open.
          </span>
        </label>
      )}

      {provider === 'ollama' && (
        <>
          <label className="block text-[13px]">
            <span className="text-[12px] text-[var(--color-ink-faint)]">Ollama address</span>
            <input
              defaultValue={settings.ollamaBaseUrl}
              onChange={(e) => update({ ollamaBaseUrl: e.target.value.trim() })}
              placeholder="http://localhost:11434"
              aria-label="Ollama address"
              className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px]"
            />
          </label>
          <label className="block text-[13px]">
            <span className="text-[12px] text-[var(--color-ink-faint)]">Installed model</span>
            {ollama.data && ollama.data.length > 0 ? (
              <select
                defaultValue={settings.ollamaModel}
                onChange={(e) => update({ ollamaModel: e.target.value })}
                className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px]"
              >
                <option value="">Choose a model</option>
                {ollama.data.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-1 text-[12px] text-[var(--color-ink-faint)]">
                {ollama.loading
                  ? 'Loading models…'
                  : (ollama.error ?? 'No local models found. Pull a model with `ollama pull`, then refresh.')}
              </p>
            )}
          </label>
          <button type="button" className="btn" onClick={ollama.refetch}>
            Refresh models
          </button>
        </>
      )}

      <ModelCheck />
    </section>
  );
}

/**
 * Prove the model actually answers.
 *
 * Categorization degrades to local heuristics whenever the model errors, which
 * is right for ingestion but makes a bad key indistinguishable from a good one.
 * This calls the model for real and prints whatever came back.
 */
function ModelCheck(): React.JSX.Element {
  const [busy, setBusy] = useState<'test' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async (which: 'test'): Promise<void> => {
    setBusy(which);
    setNote(null);
    try {
      const result = await call<{ message: string }>('model:test');
      setNote(result.message);
    } catch (e) {
      setNote((e as { message?: string }).message ?? 'The check itself failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2 border border-[var(--color-line)] px-4 py-3">
      <div className="flex flex-wrap items-start gap-2">
        <button
          type="button"
          onClick={() => void run('test')}
          disabled={busy !== null}
          className="btn"
        >
          {busy === 'test' ? 'Checking…' : 'Test the model'}
        </button>
        <RecategorizeButton />
      </div>
      {note && (
        <p role="status" className="text-[12px] text-[var(--color-ink-faint)]">
          {note}
        </p>
      )}
      <p className="text-[12px] text-[var(--color-ink-faint)]">
        Anything imported before a model was configured was categorized from merchant patterns
        alone. Recategorizing sends only those to the model; your own corrections are never
        overwritten.
      </p>
    </div>
  );
}

/** FR-048: erase everything and start over. The app restarts on the setup screen. */
function ResetData(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-danger">
        Reset everything
      </button>
    );
  }

  const reset = (): void => {
    setError(null);
    void call('data:deleteAll', { confirmation: typed }).catch((e: { message?: string }) =>
      setError(e.message ?? 'Could not reset'),
    );
  };

  return (
    <div className="space-y-2 border border-[var(--color-negative)] px-4 py-3 text-[13px]">
      <p>
        This erases every account, transaction, category change, setting and saved key on this
        machine. It cannot be undone. Back up first if you want a copy.
      </p>
      <label className="block text-[12px] text-[var(--color-ink-faint)]">
        Type {DELETE_ALL_CONFIRMATION} to confirm
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-label="Reset confirmation"
          className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[13px]"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={typed !== DELETE_ALL_CONFIRMATION}
          className="btn btn-danger"
        >
          Erase and restart
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn">
          Cancel
        </button>
      </div>
      {error && <p className="text-[12px] text-[var(--color-attention)]">{error}</p>}
    </div>
  );
}

const BACKUP_ACTIONS = {
  export: { label: 'Back up', channel: 'data:export', pathKey: 'destPath' },
  import: { label: 'Restore', channel: 'data:import', pathKey: 'srcPath' },
} as const;

/** Back up and Restore, each asking for the passphrase that locks the backup's key. */
function BackupControls(): React.JSX.Element {
  const [action, setAction] = useState<keyof typeof BACKUP_ACTIONS | null>(null);
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
      })
      .catch((e: { message?: string }) => setMessage(e.message ?? 'That did not work'));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {(Object.keys(BACKUP_ACTIONS) as (keyof typeof BACKUP_ACTIONS)[]).map((key) => (
          <button key={key} type="button" onClick={() => setAction(key)} className="btn">
            {BACKUP_ACTIONS[key].label}
          </button>
        ))}
      </div>
      {action && (
        <div className="space-y-2 border border-[var(--color-line)] px-4 py-3 text-[13px]">
          <label className="block text-[12px] text-[var(--color-ink-faint)]">
            {action === 'export'
              ? `Choose a passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters. You need it to restore this backup on any Mac.`
              : 'Enter the passphrase this backup was made with'}
            <input
              autoFocus
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              aria-label="Backup passphrase"
              className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[13px]"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={run}
              disabled={passphrase.length < MIN_PASSPHRASE_LENGTH}
              className="btn"
            >
              {BACKUP_ACTIONS[action].label}
            </button>
            <button type="button" onClick={() => setAction(null)} className="btn">
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && <p className="text-[12px] text-[var(--color-ink-faint)]">{message}</p>}
    </div>
  );
}

export function Settings(): React.JSX.Element {
  const settings = useQuery<AppSettings>('settings:get');
  const status = useQuery<SetupStatus>('setup:status');

  if (settings.loading || !settings.data) {
    return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  }
  const s = settings.data;

  return (
    <div className="space-y-8">
      <h1 className="text-[20px]">Settings</h1>

      <ModelSection settings={s} />

      {status.data && <Credentials status={status.data} onSaved={status.refetch} />}

      <section className="space-y-3">
        <p className="eyebrow">Sync</p>
        <label className="flex items-center justify-between border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-[13px]">
          <span>
            Check for new transactions every
            <span className="mt-1 block text-[12px] text-[var(--color-ink-faint)]">
              Alerts arrive within one interval while the app is running, and everything missed is
              delivered on next launch.
            </span>
          </span>
          <span className="numeric">{s.pollIntervalMinutes} min</span>
        </label>
      </section>

      <section className="space-y-3">
        <p className="eyebrow">Your data</p>
        <BackupControls />
        <p className="text-[12px] text-[var(--color-ink-faint)]">
          Everything lives on this machine. There is no copy anywhere else, so a backup is the only
          way to recover from a lost disk.
        </p>
        <ResetData />
      </section>

      {status.data && (
        <section className="space-y-1 text-[12px] text-[var(--color-ink-faint)]">
          <p className="eyebrow">Connections</p>
          <p>{status.data.accountCount} accounts connected</p>
          <p>Plaid {status.data.plaidConfigured ? 'configured' : 'not configured'}</p>
        </section>
      )}
    </div>
  );
}
