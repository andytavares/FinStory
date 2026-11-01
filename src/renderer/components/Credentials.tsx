import { useState } from 'react';
import { call } from '../lib/ipc';
import { Button, Card, Chip, Field, Select, TextInput } from './ui';
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
    <Card
      title="Credentials"
      caption="Sealed by the system keychain. These fields say whether a value is set, never what it is."
    >
      <div className="mt-3 space-y-3">
        {FIELDS.map((field) => (
          <div key={field.key} className="space-y-1">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field label={field.label}>
                  <TextInput
                    type="password"
                    autoComplete="off"
                    value={values[field.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    placeholder={configured[field.key] ? 'Enter a new value to replace it' : 'Not set'}
                  />
                </Field>
              </div>
              <Chip tone={configured[field.key] ? 'ok' : 'neutral'}>
                {configured[field.key] ? 'Set' : 'Not set'}
              </Chip>
              <Button
                disabled={busy || (values[field.key] ?? '').trim() === ''}
                onClick={() => void save({ [field.key]: values[field.key] ?? '' })}
              >
                Save
              </Button>
              {configured[field.key] && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void save({ [field.key]: '' }, [field.key])}
                  aria-label={`Remove ${field.label}`}
                >
                  Remove
                </Button>
              )}
            </div>
            <p className="ds-caption">{field.detail}</p>
          </div>
        ))}

        <div className="space-y-1">
          <Field label="Plaid environment">
            <Select
              aria-label="Plaid environment"
              value={status.plaidEnv}
              disabled={busy}
              onChange={(e) => void save({ plaidEnv: e.target.value })}
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </Select>
          </Field>
          <p className="ds-caption">
            Production credentials sent to Sandbox fail every call. If sync reports invalid keys and
            you know they are right, this is usually why.
          </p>
        </div>

        {note && (
          <p role="status" className="ds-caption">
            {note}
          </p>
        )}
      </div>
    </Card>
  );
}
