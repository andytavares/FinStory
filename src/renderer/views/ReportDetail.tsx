import { useEffect, useRef, useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { Qualification } from '../components/Qualification';
import { Button, PageHeader } from '../components/ui';
import { periodLabel } from '../lib/format';
import { DigestBody } from './reports/DigestBody';
import { MonthlyBody } from './reports/MonthlyBody';
import { periodRange, TYPE_NAMES } from './reports/period';
import type { DigestContent, MonthlyContent, ReportRecord } from './reports/detailTypes';

/** The page must be painted before the window is printed to PDF. */
const PAINT_DELAY_MS = 400;

function BackLink({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← All reports
      </Button>
    </div>
  );
}

interface ReportDetailProps {
  readonly reportId: string;
  readonly actions: { onBack: () => void; onDeleted: () => void };
  /** Export to PDF as soon as the report is on screen. */
  readonly autoExport?: boolean;
}

/** Export to PDF on demand, and once on its own when `autoExport` is set and the report is on screen. */
function useReportExport(
  reportId: string,
  autoExport: boolean,
): { exported: string | null; exportPdf: () => Promise<void> } {
  const [exported, setExported] = useState<string | null>(null);
  const autoExported = useRef(false);

  const exportPdf = async (): Promise<void> => {
    const result = await call<{ ok: boolean; path?: string }>('reports:exportPdf', {
      id: reportId,
    });
    setExported(result.ok ? `Saved to ${result.path}` : null);
  };

  useEffect(() => {
    if (!autoExport || autoExported.current) return;
    autoExported.current = true;
    const timer = setTimeout(() => void exportPdf(), PAINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autoExport]);

  return { exported, exportPdf };
}

/** The ten minutes a month that is the entire budgeting time investment. */
export function ReportDetail({
  reportId,
  actions,
  autoExport = false,
}: ReportDetailProps): React.JSX.Element {
  const { onBack, onDeleted } = actions;
  const { data, loading, error } = useQuery<ReportRecord>('reports:get', { reportId });
  const { exported, exportPdf } = useReportExport(reportId, autoExport && Boolean(data));

  const remove = async (): Promise<void> => {
    await call('reports:delete', { id: reportId });
    onDeleted();
  };

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  if (error || !data) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink onBack={onBack} />
        <p className="text-[13px] text-[var(--color-ink-muted)]">{error ?? 'Report not found.'}</p>
      </div>
    );
  }

  const monthly = data.type === 'monthly_report';
  return (
    <div className="flex flex-col gap-[14px]">
      <BackLink onBack={onBack} />
      <PageHeader
        title={monthly ? periodLabel(data.periodStart, data.periodEnd) : periodRange(data)}
        sub={`${TYPE_NAMES[data.type]}${monthly ? ` · ${periodRange(data)}` : ''}${data.wasLate ? ' · generated late' : ''}`}
        actions={
          <>
            <Button onClick={() => void exportPdf()}>Export PDF</Button>
            <Button variant="danger" onClick={() => void remove()}>
              Delete report
            </Button>
          </>
        }
      />
      {exported && <p className="ds-muted">{exported}</p>}
      <Qualification
        dataComplete={data.dataComplete}
        staleInstitutions={data.dataComplete ? [] : ['one or more accounts']}
      />
      {monthly ? (
        <MonthlyBody content={data.content as MonthlyContent} history={data.kpiSeries} />
      ) : (
        <DigestBody content={data.content as DigestContent} />
      )}
    </div>
  );
}
