import { Button, Eyebrow } from '../../components/ui';

export function DoneStep({
  ready,
  saving,
  onBack,
  onFinish,
}: {
  ready: boolean;
  saving: boolean;
  onBack: () => void;
  onFinish: () => void;
}): React.JSX.Element {
  return (
    <>
      <Eyebrow>Step 4 of 4</Eyebrow>
      <h2 className="m-0 text-[21px] font-semibold">You are ready</h2>
      <p className="ds-faint m-0">
        Money saves your choices encrypted on this Mac, then takes you to Accounts to connect your
        bank.
      </p>
      {!ready && <p className="ds-muted m-0">Enter your Plaid Client ID and Secret in step 1 first.</p>}
      <div className="ds-row mt-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" className="ml-auto" disabled={!ready || saving} onClick={onFinish}>
          {saving ? 'Saving…' : 'Save and finish'}
        </Button>
      </div>
    </>
  );
}
