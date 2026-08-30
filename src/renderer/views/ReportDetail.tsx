import { useQuery } from '../lib/ipc';
import { Money } from '../components/Money';
import { Qualification } from '../components/Qualification';
import { shortDate, percent, signedMoney } from '../lib/format';
import { useState } from 'react';
import { CategoryBars } from '../charts/CategoryBars';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface CategoryComparison {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly parentId: string | null;
  readonly parentName: string | null;
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
  readonly largestPurchases: Array<{
    id: string;
    amountMinor: number;
    categoryId: string;
    categoryName: string;
  }>;
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
  readonly categoryTotals: Array<{
    categoryId: string;
    categoryName: string;
    parentId: string | null;
    parentName: string | null;
    totalMinor: number;
  }>;
  readonly deviations: Array<{
    categoryId: string;
    categoryName: string;
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

interface Groupable {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly parentId: string | null;
  readonly parentName: string | null;
  readonly totalMinor: number;
}

/** Roll rows up to their parent, keeping the grand total intact. */
function rollUp(rows: readonly Groupable[]): Groupable[] {
  const groups = new Map<string, Groupable>();
  for (const row of rows) {
    const id = row.parentId ?? row.categoryId;
    const name = row.parentId ? (row.parentName ?? row.parentId) : row.categoryName;
    const existing = groups.get(id);
    groups.set(id, {
      categoryId: id,
      categoryName: name,
      parentId: null,
      parentName: null,
      totalMinor: (existing?.totalMinor ?? 0) + row.totalMinor,
    });
  }
  return [...groups.values()].sort((a, b) => a.totalMinor - b.totalMinor);
}

/** How a change reads: worded direction plus the amount, never a bare number. */
function ChangeCell({
  changeMinor,
  priorMinor,
}: {
  changeMinor: number;
  priorMinor: number;
}): React.JSX.Element {
  // Spending is negative, so a more-negative change means spending went up.
  const direction = changeMinor === 0 ? 'flat' : changeMinor < 0 ? 'up' : 'down';
  if (direction === 'flat') {
    return <span className="w-40 text-right text-[12px] text-[var(--color-ink-faint)]">unchanged</span>;
  }
  // Share of the prior period, so "up $50" on a $60 baseline reads differently
  // from the same $50 on a $5,000 one. Omitted when there is no baseline.
  const share = priorMinor === 0 ? null : Math.abs(changeMinor / priorMinor);
  return (
    <span
      className="numeric w-40 text-right text-[12px]"
      style={{ color: direction === 'up' ? 'var(--color-attention)' : 'var(--color-ink-faint)' }}
    >
      {direction} {signedMoney(-changeMinor)}
      {share !== null && ` (${percent(share)})`}
      {priorMinor === 0 && ' (new)'}
    </span>
  );
}

/** Parent categories with their subcategories, collapsible like the dashboard. */
function ComparisonTree({ rows }: { rows: readonly CategoryComparison[] }): React.JSX.Element {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const groups = new Map<
    string,
    {
      name: string;
      total: number;
      change: number;
      prior: number;
      children: CategoryComparison[];
      own: CategoryComparison[];
    }
  >();
  for (const row of rows) {
    const id = row.parentId ?? row.categoryId;
    const name = row.parentId ? (row.parentName ?? row.parentId) : row.categoryName;
    const g = groups.get(id) ?? { name, total: 0, change: 0, prior: 0, children: [], own: [] };
    groups.set(id, {
      name: g.name || name,
      total: g.total + row.currentMinor,
      // The parent carries its subcategories' change, so a collapsed group
      // still says whether it moved.
      change: g.change + row.changeMinor,
      prior: g.prior + row.priorMinor,
      children: row.parentId ? [...g.children, row] : g.children,
      own: row.parentId ? g.own : [...g.own, row],
    });
  }
  const ordered = [...groups.entries()].sort((a, b) => a[1].total - b[1].total);

  const toggle = (id: string): void => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  return (
    <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
      {ordered.map(([id, group]) => {
        const isOpen = expanded.has(id);
        const hasChildren = group.children.length > 0;
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => hasChildren && toggle(id)}
              aria-expanded={hasChildren ? isOpen : undefined}
              aria-label={hasChildren ? `Expand ${group.name}` : group.name}
              disabled={!hasChildren}
              className="icon flex w-full items-center gap-3 bg-[var(--color-surface)] px-4 py-2 text-left text-[13px] enabled:hover:bg-[var(--color-surface-raised)]"
            >
              <span className="w-4 shrink-0 text-[var(--color-ink-faint)]">
                {hasChildren ? isOpen ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden /> : null}
              </span>
              <span className="flex-1 truncate">{group.name}</span>
              <Money minor={group.total} magnitude className="w-28 text-right" />
              <ChangeCell changeMinor={group.change} priorMinor={group.prior} />
            </button>

            {isOpen &&
              [...group.own, ...group.children].map((row) => (
                <div
                  key={row.categoryId}
                  className="flex items-center gap-3 border-t border-[var(--color-line)] bg-[var(--color-ground)] px-4 py-2 pl-11 text-[13px]"
                >
                  <span className="flex-1 truncate text-[var(--color-ink-muted)]">
                    {row.categoryId === id ? `Directly in ${group.name}` : row.categoryName}
                  </span>
                  <Money minor={row.currentMinor} magnitude className="w-28 text-right" />
                  <ChangeCell changeMinor={row.changeMinor} priorMinor={row.priorMinor} />
                </div>
              ))}
          </li>
        );
      })}
    </ul>
  );
}

function MonthlyBody({ content }: { content: MonthlyContent }): React.JSX.Element {
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
        {/* Charted at the parent level, matching the dashboard. */}
        <CategoryBars
          data={rollUp(
            content.categoryComparisons.map((c) => ({
              categoryId: c.categoryId,
              categoryName: c.categoryName,
              parentId: c.parentId,
              parentName: c.parentName,
              totalMinor: c.currentMinor,
            })),
          )}
          title="Where it went"
        />
      </section>

      <section>
        <h2 className="mb-2 text-[15px]">Versus last period</h2>
        <ComparisonTree rows={content.categoryComparisons} />
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
                <span className="text-[var(--color-ink-muted)]">{p.categoryName}</span>
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
                <span className="text-[var(--color-ink)]">{d.categoryName}</span> was{' '}
                {d.multiple ? `${d.multiple.toFixed(1)}×` : ''} {d.direction} your normal range at{' '}
                <Money minor={d.actualMinor} magnitude />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <CategoryBars data={rollUp(content.categoryTotals)} title="Spending this period" />
      </section>

      <section>
        <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
          {content.categoryTotals.map((c) => (
            <li
              key={c.categoryId}
              className="flex items-center justify-between bg-[var(--color-surface)] px-4 py-2 text-[13px]"
            >
              <span>{c.categoryName}</span>
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
