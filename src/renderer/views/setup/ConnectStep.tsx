import { Button, Eyebrow, Field, Segmented, TextInput } from '../../components/ui';

export type PlaidEnvironment = 'sandbox' | 'production';

export interface ConnectValues {
  readonly clientId: string;
  readonly secret: string;
  readonly environment: PlaidEnvironment;
}

export function ConnectStep({
  values,
  onChange,
  onNext,
  onSave,
  saving,
}: {
  values: ConnectValues;
  onChange: (next: ConnectValues) => void;
  onNext: () => void;
  onSave: () => void;
  saving: boolean;
}): React.JSX.Element {
  const ready = values.clientId.trim().length > 0 && values.secret.trim().length > 0;
  return (
    <>
      <Eyebrow>Step 1 of 4</Eyebrow>
      <h2 className="m-0 text-[21px] font-semibold">Connect your accounts</h2>
      <p className="ds-faint m-0">
        Money reads your transactions and categorizes them for you. After this screen you will not
        be asked to enter anything again — no logging, no reconciling, no budgets to allocate.
      </p>
      <p className="ds-faint m-0 text-[12px]">
        Plaid credentials come from dashboard.plaid.com. They are stored encrypted on this machine
        and never sent anywhere else. Start with Sandbox — the 10-account production limit is a
        lifetime cap.
      </p>
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
      <div className="ds-row mt-2">
        <Button variant="primary" disabled={!ready || saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save and continue'}
        </Button>
        <Button variant="ghost" onClick={onNext}>
          Next
        </Button>
      </div>
    </>
  );
}
