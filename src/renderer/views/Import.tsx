import { PageHeader, Button, Card, Eyebrow, ProgressBar } from '../components/ui';
import { useQuery } from '../lib/ipc';
import type { AccountRow, ImportPreview, ImportProgress } from '@shared/types';
import { ColumnMapping } from './import/ColumnMapping';
import type { MoneyCategory } from './import/CategoryMapping';
import { FileCard } from './import/FileCard';
import { describeFile, plural } from './import/format';
import { useImportFlow } from './import/flow';
import { MatchAccounts, type MoneyAccountOption } from './import/MatchAccounts';
import { StepChips } from './import/StepChips';

interface InstitutionWithAccounts {
  readonly institutionName: string;
  readonly accounts: readonly Pick<AccountRow, 'id' | 'name'>[];
}

function CheckCard({
  check,
  actions,
}: {
  check: { preview: ImportPreview; creating: number; busy: boolean };
  actions: { onBack: () => void; onImport: () => void };
}): React.JSX.Element {
  const { preview, creating, busy } = check;
  const { onBack, onImport } = actions;
  return (
    <Card>
      <Eyebrow>Check</Eyebrow>
      <div style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div>{plural(preview.newCount, 'transaction')} will be added.</div>
        <div className="ds-faint">
          {plural(preview.duplicateCount, 'duplicate')} already in Money will be skipped.
        </div>
        {creating > 0 && (
          <div className="ds-faint">
            {plural(creating, 'new account')} will be created, left out of day-to-day money.
          </div>
        )}
        {preview.warnings.map((w) => (
          <div key={w} className="ds-warn" style={{ fontSize: 12 }}>
            {w}
          </div>
        ))}
      </div>
      <div className="ds-row">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" disabled={busy} onClick={onImport} style={{ marginLeft: 'auto' }}>
          Import {plural(preview.newCount, 'transaction')}
        </Button>
      </div>
    </Card>
  );
}

function ProgressCard({ progress }: { progress: ImportProgress }): React.JSX.Element {
  const { processed, total } = progress;
  const status =
    total === 0
      ? 'Getting ready…'
      : processed < total
        ? `Sorting ${processed.toLocaleString('en-US')} of ${plural(total, 'transaction')}…`
        : 'Saving…';
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Eyebrow>Importing</Eyebrow>
      <ProgressBar value={total ? processed / total : 0} label="Import progress" />
      <div>{status}</div>
      <div className="ds-faint">You can leave this screen. The import keeps going, and this page shows where it is.</div>
    </Card>
  );
}

export function Import({
  onViewTransactions,
}: {
  onViewTransactions: () => void;
}): React.JSX.Element {
  const flow = useImportFlow();
  const institutions = useQuery<InstitutionWithAccounts[]>('institutions:list');
  const categories = useQuery<MoneyCategory[]>('categories:list');
  const options: MoneyAccountOption[] = (institutions.data ?? []).flatMap((i) =>
    i.accounts.map((a) => ({ id: a.id, label: `${a.name} (${i.institutionName})` })),
  );
  const { preview, step } = flow;
  const creating = Object.values(flow.accounts).filter((v) => v === 'new').length;

  return (
    <>
      <PageHeader
        title="Import from Quicken"
        sub="Bring in history from before you connected your bank"
      />
      <StepChips step={step} />
      {flow.running ? (
        <ProgressCard progress={flow.running} />
      ) : step === 5 && flow.result ? (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 className="ds-card-title">Imported {plural(flow.result.imported, 'transaction')}</h3>
          <div className="ds-faint">
            {plural(flow.result.skippedDuplicates, 'duplicate')} skipped ·{' '}
            {plural(flow.result.createdAccounts, 'account')} created
          </div>
          <div className="ds-row">
            <Button variant="primary" onClick={onViewTransactions}>
              View transactions
            </Button>
            <Button variant="ghost" onClick={flow.startOver}>
              Import another file
            </Button>
          </div>
        </Card>
      ) : (
        <div className="ds-grid" style={{ gridTemplateColumns: '1fr 1.25fr' }}>
          <FileCard
            fileName={flow.file?.name ?? null}
            summary={
              preview && !preview.needsMapping ? describeFile(preview, flow.file?.name ?? '') : null
            }
            onFile={(f) => void flow.openFile(f)}
          />
          {preview?.needsMapping && (
            <ColumnMapping
              headers={preview.headers ?? []}
              onRead={(m) => void flow.readWithMapping(m)}
            />
          )}
          {preview && !preview.needsMapping && step === 2 && (
            <MatchAccounts
              preview={preview}
              options={options}
              categories={categories.data ?? []}
              accountChoice={flow.accounts}
              categoryChoice={flow.categories}
              busy={flow.busy}
              onAccount={(label, id) => void flow.chooseAccount(label, id)}
              onCategory={flow.chooseCategory}
              onBack={flow.startOver}
              onCheck={() => flow.goTo(3)}
            />
          )}
          {preview && step === 3 && (
            <CheckCard
              check={{ preview, creating, busy: flow.busy }}
              actions={{ onBack: () => flow.goTo(2), onImport: () => void flow.commit() }}
            />
          )}
        </div>
      )}
      {flow.error && (
        <p role="alert" className="ds-neg">
          {flow.error}
        </p>
      )}
    </>
  );
}
