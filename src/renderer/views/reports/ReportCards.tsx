import { Button, Card, Eyebrow } from '../../components/ui';
import { Sparkline } from '../../charts/Sparkline';
import { SpendingOverTime } from '../../charts/SpendingOverTime';
import { periodLabel, spend } from '../../lib/format';
import { periodRange, reportTitle } from './period';
import type { ReportSummary } from './types';

interface ReportActions {
  readonly onOpen: (id: string) => void;
}

function subtitle(report: ReportSummary): string {
  return [
    report.type === 'custom' ? 'Custom range' : null,
    periodRange(report),
    report.wasLate ? 'generated late' : null,
    report.dataComplete ? null : 'incomplete data',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function FeaturedReport({
  report,
  onOpen,
  onExport,
}: ReportActions & { report: ReportSummary; onExport: (id: string) => void }): React.JSX.Element {
  const data = report.series.map((spendingMinor, index) => ({ label: String(index + 1), spendingMinor }));
  return (
    <ul className="m-0 list-none p-0">
      <li>
        <Card className="grid grid-cols-[1fr_1.2fr] gap-[18px]">
          <div>
            <Eyebrow>Latest · {periodLabel(report.periodStart, report.periodEnd)}</Eyebrow>
            <div className="mt-1 text-[19px] font-semibold">{report.headline}</div>
            <div className="ds-faint mt-1.5">{subtitle(report)}</div>
            <div className="ds-row mt-3">
              <Button variant="primary" size="sm" onClick={() => onOpen(report.id)}>
                Open report
              </Button>
              <Button size="sm" onClick={() => onExport(report.id)}>
                Export PDF
              </Button>
            </div>
          </div>
          <SpendingOverTime data={data} priorAverageMinor={null} title="Spending by day" />
        </Card>
      </li>
    </ul>
  );
}

export function ReportCard({
  report,
  onOpen,
  onDelete,
}: ReportActions & { report: ReportSummary; onDelete: (id: string) => void }): React.JSX.Element {
  return (
    <li className="list-none">
      <Card>
        <div className="ds-row">
          <div>
            <div className="font-semibold">{reportTitle(report)}</div>
            <div className="ds-faint text-[11.5px]">{subtitle(report)}</div>
          </div>
          <span className="ds-num ml-auto">{spend(report.totalSpendingMinor)}</span>
        </div>
        <Sparkline values={report.series} color="var(--color-accent)" width={300} height={36} />
        <div className="ds-row">
          <Button size="sm" onClick={() => onOpen(report.id)}>
            Open
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            aria-label={`Delete report from ${report.periodStart.slice(0, 10)}`}
            onClick={() => onDelete(report.id)}
          >
            Delete
          </Button>
        </div>
      </Card>
    </li>
  );
}
