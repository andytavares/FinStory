import { Button, Card, Eyebrow } from '../../components/ui';

export function HistoryStep({
  onBack,
  onSkip,
}: {
  onBack: () => void;
  onSkip: () => void;
}): React.JSX.Element {
  return (
    <>
      <Eyebrow>Step 3 of 4</Eyebrow>
      <h2 className="m-0 text-[21px] font-semibold">Bring in your old history</h2>
      <p className="ds-faint m-0">
        Optional. If you used Quicken, import its export and Money starts with years of context
        instead of the last few months.
      </p>
      <Card title="Import from Quicken" caption="Available after setup in Import">
        <p className="ds-muted" style={{ margin: '10px 0 12px' }}>
          Your corrections in Quicken become Money&apos;s first rules.
        </p>
        <Button disabled>Import from Quicken</Button>
      </Card>
      <div className="ds-row mt-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" className="ml-auto" onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    </>
  );
}
