import { useQuery } from '../lib/ipc';
import { Money } from '../components/Money';
import { Qualification } from '../components/Qualification';
import { shortDate } from '../lib/format';

interface CategoryComparison {
  readonly categoryId: string;
  readonly currentMinor: number;
  readonly priorMinor: number;
  readonly changeMinor: number;
  readonly direction: 'up' | 'down' | 'flat';
}

interface MonthlyContent {
  readonly totalIncomeMinor: number;
  readonly totalSpendingMinor: number;
  readonly savingsMinor: number;
  readonly savingsRate: number;
  readonly categoryComparisons: CategoryComparison[];
  readonly largestPurchases: Array<{ id: string; amountMinor: number; categoryId: string }>;
  readonly recurringAudit: Array<{
    merchantKey: string;
    currentAmountMinor: number;
    cadence: string;
    cumulativePaidMinor: number;
  }>;
  readonly projectedAnnualSpendingMinor: number;
  readonly projectionAssumption: string;
  readonly qualification: string | null;
}

interface DigestContent {
  readonly hadActivity: boolean;
  readonly categoryTotals: Array<{ categoryId: string; totalMinor: number }>;
  readonly deviations: Array<{
    categoryId: string;
    hasClaim: boolean;
    direction: 'above' | 'below' | null;
    multiple: number | null;
    actualMinor: number;
  }>;
  readonly qualification: string | null;
}

interface ReportRecord {
  readonly id: string;
  readonly type: 'weekly_digest' | 'monthly_report';
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly dataComplete: boolean;
  readonly wasLate: boolean;
  readonly content: MonthlyContent | DigestContent;
}

/** The ten minutes a month that is the entire budgeting time investment. */
export function ReportDetail({
  reportId,
  onBack,
}: {
  reportId: string;
  onBack: () => void;
}): React.JSX.Element {
  const { data, loading, error } = useQuery<ReportRecord>('reports:get', { reportId });

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  if (error || !data) {
    return (
      <div className="space-y-3">
        <BackLink onBack={onBack} />
        <p className="text-[13px] text-[var(--color-ink-muted)]">{error ?? 'Report not found.'}</p>
      </div>
    );
  }

  const period = `${shortDate(data.periodStart)} – ${shortDate(data.periodEnd)}`;

  return (
    <div className="space-y-6">
      <BackLink onBack={onBack} />

      <header>
        <p className="eyebrow">
          {data.type === 'monthly_report' ? 'Monthly report' : 'Weekly digest'}
          {data.wasLate && ' · generated late'}
        </p>
        <h1 className="mt-1 text-[22px] tracking-tight">{period}</h1>
      </header>

      <Qualification
        dataComplete={data.dataComplete}
        staleInstitutions={data.dataComplete ? [] : ['one or more accounts']}
      />

      {data.type === 'monthly_report' ? (
        <MonthlyBody content={data.content as MonthlyContent} />
      ) : (
        <DigestBody content={data.content as DigestContent} />
      )}
    </div>
  );
}

function BackLink({ onBack }: { onBack: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onBack}
      className="text-[12px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
    >
      ← All reports
    </button>
  );
}

function MonthlyBody({ content }: { content: MonthlyContent }): React.JSX.Element {
  const worst = Math.min(...content.categoryComparisons.map((c) => c.currentMinor), -1);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-4 gap-px bg-[var(--color-line)]">
        {[
          { label: 'In', value: content.totalIncomeMinor, direction: true },
          { label: 'Out', value: content.totalSpendingMinor, direction: true },
          { label: 'Saved', value: content.savingsMinor, direction: true },
        ].map((cell) => (
          <div key={cell.label} className="bg-[var(--color-surface)] px-4 py-3">
            <p className="eyebrow">{cell.label}</p>
            <Money minor={cell.value} direction className="mt-1 block text-[19px]" />
          </div>
        ))}
        <div className="bg-[var(--color-surface)] px-4 py-3">
          <p className="eyebrow">Savings rate</p>
          <p className="numeric mt-1 text-[19px]">{Math.round(content.savingsRate * 100)}%</p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[15px]">By category, versus last period</h2>
        <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
          {content.categoryComparisons.map((c) => (
            <li
              key={c.categoryId}
              className="flex items-center gap-4 bg-[var(--color-surface)] px-4 py-2 text-[13px]"
            >
              <span className="w-40 shrink-0 truncate">{c.categoryId}</span>
              <span className="h-1 flex-1 bg-[var(--color-surface-raised)]">
                <span
                  className="block h-full bg-[var(--color-ink-faint)]"
                  style={{ width: `${(c.currentMinor / worst) * 100}%` }}
                />
              </span>
              <Money minor={c.currentMinor} magnitude className="w-24 text-right" />
              <span
                className="numeric w-24 text-right text-[12px]"
                style={{
                  color:
                    c.direction === 'up' ? 'var(--color-attention)' : 'var(--color-ink-faint)',
                }}
              >
                {/* Direction is worded, not colour-only. */}
                {c.direction === 'flat'
                  ? 'unchanged'
                  : `${c.direction === 'up' ? 'up' : 'down'} ${Math.abs(c.changeMinor / 100).toFixed(0)}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {content.largestPurchases.length > 0 && (
        <section>
          <h2 className="mb-2 text-[15px]">Largest purchases</h2>
          <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
            {content.largestPurchases.slice(0, 5).map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between bg-[var(--color-surface)] px-4 py-2 text-[13px]"
              >
                <span className="text-[var(--color-ink-muted)]">{p.categoryId}</span>
                <Money minor={p.amountMinor} magnitude />
              </li>
            ))}
          </ul>
        </section>
      )}

      {content.recurringAudit.length > 0 && (
        <section>
          <h2 className="mb-2 text-[15px]">Recurring charges</h2>
          <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
            {content.recurringAudit.map((r) => (
              <li
                key={r.merchantKey}
                className="flex items-center justify-between bg-[var(--color-surface)] px-4 py-2 text-[13px]"
              >
                <span>
                  {r.merchantKey}
                  <span className="ml-2 text-[12px] text-[var(--color-ink-faint)]">{r.cadence}</span>
                </span>
                <span>
                  <Money minor={r.currentAmountMinor} magnitude />
                  <span className="numeric ml-3 text-[12px] text-[var(--color-ink-faint)]">
                    paid so far <Money minor={r.cumulativePaidMinor} magnitude />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <p className="eyebrow">If nothing changes</p>
        <Money
          minor={content.projectedAnnualSpendingMinor}
          magnitude
          className="mt-1 block text-[19px]"
        />
        {/* FR-041: every projection states its assumption. */}
        <p className="mt-2 text-[12px] text-[var(--color-ink-faint)]">
          {content.projectionAssumption}
        </p>
      </section>
    </div>
  );
}

function DigestBody({ content }: { content: DigestContent }): React.JSX.Element {
  if (!content.hadActivity) {
    return (
      <p className="border border-dashed border-[var(--color-line)] px-4 py-8 text-center text-[13px] text-[var(--color-ink-faint)]">
        No activity in this period.
      </p>
    );
  }

  // Only deviations with a claim are shown: without enough history the system
  // states totals and says nothing comparative (FR-040).
  const claims = content.deviations.filter((d) => d.hasClaim);

  return (
    <div className="space-y-6">
      {claims.length > 0 && (
        <section>
          <h2 className="mb-2 text-[15px]">Worth noticing</h2>
          <ul className="space-y-1 text-[13px]">
            {claims.map((d) => (
              <li key={d.categoryId} className="text-[var(--color-ink-muted)]">
                <span className="text-[var(--color-ink)]">{d.categoryId}</span> was{' '}
                {d.multiple ? `${d.multiple.toFixed(1)}×` : ''} {d.direction} your normal range at{' '}
                <Money minor={d.actualMinor} magnitude />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-[15px]">Spending this period</h2>
        <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
          {content.categoryTotals.map((c) => (
            <li
              key={c.categoryId}
              className="flex items-center justify-between bg-[var(--color-surface)] px-4 py-2 text-[13px]"
            >
              <span>{c.categoryId}</span>
              <Money minor={c.totalMinor} magnitude />
            </li>
          ))}
        </ul>
      </section>

      {claims.length === 0 && (
        <p className="text-[12px] text-[var(--color-ink-faint)]">
          No comparisons yet — a few more weeks of history are needed before deviations mean
          anything.
        </p>
      )}
    </div>
  );
}
