import { useState } from 'react';
import { call } from '../lib/ipc';
import type { SetupStatus } from '@shared/types';

interface Field {
  readonly key: 'plaidClientId' | 'plaidSecret' | 'anthropicApiKey';
  readonly label: string;
  readonly detail: string;
}

const FIELDS: readonly Field[] = [
  { key: 'plaidClientId', label: 'Plaid client ID', detail: 'From the Plaid dashboard.' },
  { key: 'plaidSecret', label: 'Plaid secret', detail: 'Must match the environment below.' },
  {
    key: 'anthropicApiKey',
    label: 'Anthropic API key',
    detail: 'Leave empty and save to remove it and categorize from history alone.',
  },
];

/**
 * Replace a credential after setup.
 *
 * Keys rotate and get revoked, and until now they could only be entered on the
 * first-run screen — reaching a bad key meant there was no way to fix it from
 * inside the app.
 *
 * Stored values are never sent to the renderer (FR-047), so these fields show
 * whether something is set, never what it is.
 */
export function Credentials({
  status,
  onSaved,
}: {
  status: SetupStatus;
  onSaved: () => void;
}): React.JSX.Element {
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const configured: Record<Field['key'], boolean> = {
    plaidClientId: status.plaidClientIdConfigured,
    plaidSecret: status.plaidSecretConfigured,
    anthropicApiKey: status.categorizationConfigured,
  };

  const save = async (patch: Record<string, string>, clearKeys: string[] = []): Promise<void> => {
    setBusy(true);
    setNote(null);
    try {
      const result = await call<{ message: string }>('credentials:update', patch);
      setNote(result.message);
      setValues((v) => {
        const next = { ...v };
        for (const k of [...Object.keys(patch), ...clearKeys]) delete next[k];
        return next;
      });
      onSaved();
    } catch (e) {
      setNote((e as { message?: string }).message ?? 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <div>
        <p className="eyebrow">Credentials</p>
        <p className="text-[12px] text-[var(--color-ink-faint)]">
          Sealed by the system keychain and never shown again — these fields say whether a value is
          set, not what it is. Replacing one takes effect on the next sync.
        </p>
      </div>

      <div className="space-y-3 border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        {FIELDS.map((field) => (
          <div key={field.key} className="space-y-1">
            <div className="flex items-baseline justify-between">
              <label htmlFor={field.key} className="text-[13px]">
                {field.label}
              </label>
              <span className="text-[12px] text-[var(--color-ink-faint)]">
                {configured[field.key] ? 'Set' : 'Not set'}
              </span>
            </div>
            <div className="flex gap-2">
              <input
                id={field.key}
                type="password"
                autoComplete="off"
                value={values[field.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                placeholder={configured[field.key] ? 'Enter a new value to replace it' : 'Not set'}
                className="flex-1 border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px]"
              />
              <button
                type="button"
                disabled={busy || (values[field.key] ?? '').trim() === ''}
                onClick={() => void save({ [field.key]: values[field.key] ?? '' })}
                className="btn"
              >
                Save
              </button>
              {configured[field.key] && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save({ [field.key]: '' }, [field.key])}
                  aria-label={`Remove ${field.label}`}
                  className="btn"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-[12px] text-[var(--color-ink-faint)]">{field.detail}</p>
          </div>
        ))}

        <div className="space-y-1">
          <label htmlFor="plaidEnv" className="text-[13px]">
            Plaid environment
          </label>
          <select
            id="plaidEnv"
            value={status.plaidEnv}
            disabled={busy}
            onChange={(e) => void save({ plaidEnv: e.target.value })}
            className="w-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px]"
          >
            <option value="sandbox">Sandbox</option>
            <option value="production">Production</option>
          </select>
          <p className="text-[12px] text-[var(--color-ink-faint)]">
            Production credentials sent to Sandbox fail every call. If sync reports invalid keys and
            you know they are right, this is usually why.
          </p>
        </div>

        {note && (
          <p role="status" className="text-[12px] text-[var(--color-ink-faint)]">
            {note}
          </p>
        )}
      </div>
    </section>
  );
}
