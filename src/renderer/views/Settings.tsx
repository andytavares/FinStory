import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import type { AppSettings, SetupStatus } from '@shared/types';

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

      {provider === 'ollama' && (
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
              No local models found. Start Ollama and pull a model, then reopen this screen.
            </p>
          )}
        </label>
      )}
    </section>
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void call('data:export', { destPath: '' })}
            className="border border-[var(--color-line)] px-3 py-2 text-[13px] hover:bg-[var(--color-surface-raised)]"
          >
            Back up
          </button>
          <button
            type="button"
            onClick={() => void call('data:import', { srcPath: '' })}
            className="border border-[var(--color-line)] px-3 py-2 text-[13px] hover:bg-[var(--color-surface-raised)]"
          >
            Restore
          </button>
        </div>
        <p className="text-[12px] text-[var(--color-ink-faint)]">
          Everything lives on this machine. There is no copy anywhere else, so a backup is the only
          way to recover from a lost disk.
        </p>
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
