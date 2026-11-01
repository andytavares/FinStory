import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { EmptyState } from '../components/EmptyState';
import { Button, PageHeader } from '../components/ui';
import { ReportDetail } from './ReportDetail';
import { CustomRangeForm, type CustomRange } from './reports/CustomRangeForm';
import { FeaturedReport, ReportCard } from './reports/ReportCards';
import type { ReportSummary, ReportType } from './reports/types';

const READY: Record<ReportType, string> = {
  custom: 'Custom report ready.',
  monthly_report: 'Monthly report ready.',
  weekly_digest: 'Weekly digest ready.',
};

/** FR-038: the monthly read. Ten minutes, once a month, is the whole budget. */
export function Reports({
  openReportId,
  onOpenReport,
  onCloseReport,
}: {
  openReportId: string | null;
  onOpenReport: (reportId: string) => void;
  onCloseReport: () => void;
}): React.JSX.Element {
  const { data, loading, refetch } = useQuery<ReportSummary[]>('reports:list', { type: 'all', limit: 24 });
  const [generating, setGenerating] = useState<ReportType | null>(null);
  const [generated, setGenerated] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportOnOpen, setExportOnOpen] = useState(false);

  const generate = async (type: ReportType, extra: CustomRange | object = {}): Promise<void> => {
    setGenerating(type);
    setGenerated(null);
    setError(null);
    try {
      await call('reports:generate', { type, ...extra });
      refetch();
      setGenerated(READY[type]);
      setCustomOpen(false);
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not generate that report');
    } finally {
      setGenerating(null);
    }
  };

  const open = (id: string, exportToo = false): void => {
    setExportOnOpen(exportToo);
    onOpenReport(id);
  };

  if (openReportId) {
    return (
      <ReportDetail
        reportId={openReportId}
        onBack={onCloseReport}
        onDeleted={() => {
          refetch();
          onCloseReport();
        }}
        autoExport={exportOnOpen}
      />
    );
  }
  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;

  const month = new Date().toLocaleDateString('en-US', { month: 'long' });
  const busy = generating !== null;
  const [latest, ...older] = data ?? [];

  return (
    <div className="flex flex-col gap-[14px]">
      <PageHeader
        title="Reports"
        sub="A digest every Monday, a full report on the 1st"
        actions={
          <>
            <Button onClick={() => setCustomOpen((v) => !v)}>Custom range…</Button>
            <Button disabled={busy} onClick={() => void generate('weekly_digest')}>
              Run weekly digest
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void generate('monthly_report')}>
              Run {month} report
            </Button>
          </>
        }
      />
      {customOpen && (
        <CustomRangeForm busy={busy} onGenerate={(range) => void generate('custom', range)} />
      )}
      {error && <p className="ds-warn">{error}</p>}
      {generated && <p className="ds-muted">{generated}</p>}
      {latest ? (
        <>
          <FeaturedReport report={latest} onOpen={open} onExport={(id) => open(id, true)} />
          <ul className="ds-grid m-0 list-none grid-cols-3 p-0">
            {older.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                onOpen={open}
                onDelete={(id) => void call('reports:delete', { id }).then(refetch)}
              />
            ))}
          </ul>
        </>
      ) : (
        <EmptyState
          title="No reports yet"
          detail="A digest arrives weekly and a full report monthly, generated whether or not the app is open. You can also run one now."
        />
      )}
    </div>
  );
}
