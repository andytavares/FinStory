import { useState } from 'react';
import { call } from '../lib/ipc';
import { ConnectStep, type ConnectValues } from './setup/ConnectStep';
import { SortStep, type SortChoice } from './setup/SortStep';
import { HistoryStep } from './setup/HistoryStep';
import { DoneStep } from './setup/DoneStep';
import { SetupSteps } from './setup/SetupSteps';
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
  const [step, setStep] = useState(0);
  const [connect, setConnect] = useState<ConnectValues>({ clientId: '', secret: '', environment: 'sandbox' });
  const [sort, setSort] = useState<SortChoice>({ provider: null, model: '', anthropicKey: '' });
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

  const anthropicKey = sort.provider === 'anthropic' ? sort.anthropicKey.trim() : '';
  const ready = connect.clientId.trim().length > 0 && connect.secret.trim().length > 0;

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await call('setup:saveCredentials', {
        plaidClientId: connect.clientId.trim(),
        plaidSecret: connect.secret.trim(),
        plaidEnv: connect.environment,
        ...(anthropicKey ? { anthropicApiKey: anthropicKey } : {}),
      });
      if (sort.provider) {
        await call('settings:update', {
          modelProvider: sort.provider,
          ...(sort.provider === 'ollama' && sort.model ? { ollamaModel: sort.model } : {}),
        });
      }
      onComplete();
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not save your credentials');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid h-full grid-cols-[440px_1fr] overflow-auto bg-[var(--color-ground)]">
      <SetupSteps step={step} onSelect={setStep} />
      <main className="flex flex-col gap-[14px] px-14 py-[70px]">
        {step === 0 && (
          <ConnectStep
            form={{ values: connect, onChange: setConnect }}
            save={{ saving, onSave: () => void save() }}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <SortStep sort={{ choice: sort, onChange: setSort }} onBack={() => setStep(0)} onNext={() => setStep(2)} />
        )}
        {step === 2 && <HistoryStep onBack={() => setStep(1)} onSkip={() => setStep(3)} />}
        {step === 3 && (
          <DoneStep status={{ ready, saving }} onBack={() => setStep(2)} onFinish={() => void save()} />
        )}
        {error && <p className="m-0 text-[13px] text-[var(--color-attention)]">{error}</p>}
      </main>
    </div>
  );
}
