import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { Money } from '../components/Money';
import { periodLabel } from '../lib/format';
import { EmptyState } from '../components/EmptyState';
import { ReportDetail } from './ReportDetail';

interface ReportSummary {
  readonly id: string;
  readonly type: 'weekly_digest' | 'monthly_report' | 'custom';
  readonly label: string | null;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly dataComplete: boolean;
  readonly wasLate: boolean;
  readonly totalSpendingMinor: number;
  readonly savingsRate: number;
}

/** FR-038: the monthly read. Ten minutes, once a month, is the whole budget. */
export function Reports(): React.JSX.Element {
  const { data, loading, refetch } = useQuery<ReportSummary[]>('reports:list', { type: 'all', limit: 24 });
  const [generating, setGenerating] = useState<string | null>(null);
  const [generated, setGenerated] = useState<string | null>(null);
  const [openReportId, setOpenReportId] = useState<string | null>(null);

  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const generate = async (
    type: 'weekly_digest' | 'monthly_report' | 'custom',
    extra: Record<string, string> = {},
  ): Promise<void> => {
    setGenerating(type);
    setGenerated(null);
    setError(null);
    try {
      await call('reports:generate', { type, ...extra });
      refetch();
      setGenerated(
        type === 'custom'
          ? 'Custom report ready.'
          : type === 'monthly_report'
            ? 'Monthly report ready.'
            : 'Weekly digest ready.',
      );
      setCustomOpen(false);
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not generate that report');
    } finally {
      setGenerating(null);
    }
  };

  const controls = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={generating !== null}
        onClick={() => void generate('weekly_digest')}
        className="border border-[var(--color-line)] px-3 py-1 text-[12px] hover:bg-[var(--color-surface-raised)] disabled:opacity-40"
      >
        Run weekly digest
      </button>
      <button
        type="button"
        disabled={generating !== null}
        onClick={() => void generate('monthly_report')}
        className="border border-[var(--color-line)] px-3 py-1 text-[12px] hover:bg-[var(--color-surface-raised)] disabled:opacity-40"
      >
        Run monthly report
      </button>
      <button
        type="button"
        onClick={() => setCustomOpen((v) => !v)}
        className="border border-[var(--color-line)] px-3 py-1 text-[12px] hover:bg-[var(--color-surface-raised)]"
      >
        Custom range…
      </button>
    </div>
  );

  const customForm = customOpen && (
    <div className="flex flex-wrap items-end gap-3 border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-[13px]">
      <label className="block">
        <span className="text-[12px] text-[var(--color-ink-faint)]">From</span>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="Report start date"
          className="mt-1 block border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[13px]"
        />
      </label>
      <label className="block">
        <span className="text-[12px] text-[var(--color-ink-faint)]">To</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="Report end date"
          className="mt-1 block border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[13px]"
        />
      </label>
      <label className="block flex-1">
        <span className="text-[12px] text-[var(--color-ink-faint)]">Name (optional)</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Trip to Japan"
          aria-label="Report name"
          className="mt-1 block w-full border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[13px] outline-none"
        />
      </label>
      <button
        type="button"
        disabled={!from || !to || generating !== null}
        onClick={() =>
          void generate('custom', {
            periodStart: new Date(from).toISOString(),
            periodEnd: new Date(to).toISOString(),
            ...(label.trim() ? { label: label.trim() } : {}),
          })
        }
        className="border border-[var(--color-line)] px-3 py-1 text-[12px] disabled:opacity-40"
      >
        Generate
      </button>
    </div>
  );

  if (openReportId) {
    return <ReportDetail reportId={openReportId} onBack={() => setOpenReportId(null)} />;
  }

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  if (!data || data.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-baseline justify-between">
          <h1 className="text-[20px]">Reports</h1>
          {controls}
        </div>
        {customForm}
        {error && <p className="text-[13px] text-[var(--color-attention)]">{error}</p>}
        {generated && <p className="text-[13px] text-[var(--color-ink-muted)]">{generated}</p>}
        <EmptyState
          title="No reports yet"
          detail="A digest arrives weekly and a full report monthly, generated whether or not the app is open. You can also run one now."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[20px]">Reports</h1>
        {controls}
      </div>
      {customForm}
      {error && <p className="text-[13px] text-[var(--color-attention)]">{error}</p>}
      {generated && <p className="text-[13px] text-[var(--color-ink-muted)]">{generated}</p>}
      <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
        {data.map((r) => (
          <li key={r.id} className="flex items-center bg-[var(--color-surface)]">
            <button
              type="button"
              onClick={() => setOpenReportId(r.id)}
              className="flex w-full items-center gap-4 bg-[var(--color-surface)] px-4 py-3 text-left hover:bg-[var(--color-surface-raised)]"
            >
            <div className="flex-1">
              <p className="text-[13px]">
                {r.label ?? periodLabel(r.periodStart, r.periodEnd)}
              </p>
              <p className="text-[12px] text-[var(--color-ink-faint)]">
                {r.type === 'monthly_report'
                  ? 'Monthly report'
                  : r.type === 'custom'
                    ? 'Custom range'
                    : 'Weekly digest'}
                {r.wasLate && ' · generated late'}
                {!r.dataComplete && ' · incomplete data'}
              </p>
            </div>
            <div className="text-right">
              <Money minor={r.totalSpendingMinor} magnitude className="block" />
              <span className="numeric text-[11px] text-[var(--color-ink-faint)]">
                {Math.round(r.savingsRate * 100)}% saved
              </span>
            </div>
            </button>
            <button
              type="button"
              onClick={() => void call('reports:delete', { id: r.id }).then(refetch)}
              aria-label={`Delete report from ${r.periodStart.slice(0, 10)}`}
              className="px-4 text-[12px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
