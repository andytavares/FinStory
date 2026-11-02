import { Button, Eyebrow, Field, Segmented, TextInput } from '../../components/ui';

export type PlaidEnvironment = 'sandbox' | 'production';

export interface ConnectValues {
  readonly clientId: string;
  readonly secret: string;
  readonly environment: PlaidEnvironment;
}

function CredentialFields({
  values,
  onChange,
}: {
  values: ConnectValues;
  onChange: (next: ConnectValues) => void;
}): React.JSX.Element {
  return (
    <div className="grid max-w-[360px] gap-[14px]">
      <Field label="Client ID">
        <TextInput
          aria-label="Client ID"
          value={values.clientId}
          onChange={(e) => onChange({ ...values, clientId: e.target.value })}
        />
      </Field>
      <Field label="Secret">
        <TextInput
          aria-label="Secret"
          type="password"
          value={values.secret}
          onChange={(e) => onChange({ ...values, secret: e.target.value })}
        />
      </Field>
      <Segmented
        label="Environment"
        value={values.environment}
        onChange={(environment) => onChange({ ...values, environment })}
        options={[
          { value: 'sandbox', label: 'Sandbox' },
          { value: 'production', label: 'Production' },
        ]}
      />
    </div>
  );
}

interface ConnectStepProps {
  readonly form: {
    readonly values: ConnectValues;
    readonly onChange: (next: ConnectValues) => void;
  };
  readonly save: { readonly saving: boolean; readonly onSave: () => void };
  readonly onNext: () => void;
}

export function ConnectStep({ form, save, onNext }: ConnectStepProps): React.JSX.Element {
  const { values, onChange } = form;
  const { saving, onSave } = save;
  const ready = values.clientId.trim().length > 0 && values.secret.trim().length > 0;
  return (
    <>
      <Eyebrow>Step 1 of 4</Eyebrow>
      <h2 className="m-0 text-[21px] font-semibold">Connect your accounts</h2>
      <p className="ds-faint m-0">
        Money reads your transactions through Plaid and categorizes them for you. Plaid is optional:
        skip it to add accounts and transactions by hand, and connect a bank later in Settings.
      </p>
      <p className="ds-faint m-0 text-[12px]">
        Plaid credentials come from dashboard.plaid.com. They are stored encrypted on this machine
        and never sent anywhere else. Start with Sandbox — the 10-account production limit is a
        lifetime cap.
      </p>
      <CredentialFields values={values} onChange={onChange} />
      <div className="ds-row mt-2">
        <Button variant="primary" disabled={!ready || saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save and continue'}
        </Button>
        <Button variant="ghost" onClick={onNext}>
          Skip, I will enter things by hand
        </Button>
      </div>
    </>
  );
}
