import { useState } from 'react';
import { call } from '../lib/ipc';
import type { SetupStatus } from '@shared/types';

/**
 * First run.
 *
 * The only screen in the app that asks for input, and it asks once. Everything
 * afterward is read-only by design (Constitution VIII).
 *
 * Credentials go straight to the main process and are sealed there; nothing
 * entered here is ever read back (FR-047).
 */
export function Setup({
  status,
  onComplete,
}: {
  status: SetupStatus;
  onComplete: () => void;
}): React.JSX.Element {
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!status.encryptionAvailable) {
    // Constitution VII: fail loudly. There is no "continue anyway".
    return (
      <div className="mx-auto max-w-lg px-8 py-20">
        <h1 className="text-[20px]">Money cannot start</h1>
        <p className="mt-3 text-[13px] text-[var(--color-ink-muted)]">
          Your system does not currently provide the encryption Money needs to protect your
          financial data at rest. Money will not store your data unencrypted, so it cannot continue.
        </p>
        <p className="mt-3 text-[13px] text-[var(--color-ink-faint)]">
          On macOS this needs Keychain access, on Windows the Credential store, and on Linux a
          running secret service such as gnome-keyring.
        </p>
      </div>
    );
  }

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await call('setup:saveCredentials', {
        plaidClientId: clientId.trim(),
        plaidSecret: secret.trim(),
        plaidEnv: environment,
        ...(anthropicKey.trim() ? { anthropicApiKey: anthropicKey.trim() } : {}),
      });
      onComplete();
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not save your credentials');
    } finally {
      setSaving(false);
    }
  };

  const ready = clientId.trim().length > 0 && secret.trim().length > 0;

  return (
    <div className="mx-auto max-w-xl px-8 py-16">
      <p className="eyebrow">Set up once</p>
      <h1 className="mt-2 text-[24px] tracking-tight">Connect your accounts</h1>
      <p className="mt-3 text-[13px] text-[var(--color-ink-muted)]">
        Money reads your transactions and categorizes them for you. After this screen you will not
        be asked to enter anything again — no logging, no reconciling, no budgets to allocate.
      </p>

      <section className="mt-8 space-y-4">
        <p className="eyebrow">Plaid</p>
        <p className="text-[12px] text-[var(--color-ink-faint)]">
          From dashboard.plaid.com. Stored encrypted on this machine and never sent anywhere else.
          Start with Sandbox — the 10-account production limit is a lifetime cap.
        </p>

        <label className="block">
          <span className="text-[12px] text-[var(--color-ink-faint)]">Client ID</span>
          <input
            aria-label="Client ID"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px] outline-none"
          />
        </label>

        <label className="block">
          <span className="text-[12px] text-[var(--color-ink-faint)]">Secret</span>
          <input
            aria-label="Secret"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="mt-1 w-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px] outline-none"
          />
        </label>

        <fieldset className="flex gap-4 text-[13px]">
          <legend className="text-[12px] text-[var(--color-ink-faint)]">Environment</legend>
          {(['sandbox', 'production'] as const).map((env) => (
            <label key={env} className="flex items-center gap-2">
              <input
                type="radio"
                name="environment"
                checked={environment === env}
                onChange={() => setEnvironment(env)}
              />
              {env === 'sandbox' ? 'Sandbox' : 'Production'}
            </label>
          ))}
        </fieldset>
      </section>

      <section className="mt-8 space-y-3">
        <p className="eyebrow">Categorization (optional)</p>
        <p className="text-[12px] text-[var(--color-ink-faint)]">
          An Anthropic API key lets Money categorize merchants your own history cannot resolve. It
          sends the merchant name, amount, date, and your category history for that one merchant —
          never account numbers, balances, credentials, or totals. Leave it blank to keep
          everything on this machine; more transactions will need your review.
        </p>
        <input
          type="password"
          value={anthropicKey}
          onChange={(e) => setAnthropicKey(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px] outline-none placeholder:text-[var(--color-ink-faint)]"
        />
      </section>

      {error && <p className="mt-6 text-[13px] text-[var(--color-attention)]">{error}</p>}

      <button
        type="button"
        disabled={!ready || saving}
        onClick={() => void save()}
        className="btn mt-8"
      >
        {saving ? 'Saving…' : 'Save and continue'}
      </button>
    </div>
  );
}
