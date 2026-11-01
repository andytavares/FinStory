import { Card, Chip, MerchantMark, Stat, ListRow, ListRows } from '../../components/ui';
import { CategoryDonut } from '../../charts/CategoryDonut';
import { spend } from '../../lib/format';
import { ComparisonList } from './ComparisonList';
import { kpiTiles, previousMonthName } from './kpis';
import { rollUp } from './rollUp';
import type { KpiPoint, MonthlyContent } from './detailTypes';

const TWO_COLUMNS = 'ds-grid grid-cols-2';

function WhereItWent({ content }: { content: MonthlyContent }): React.JSX.Element {
  const parts = rollUp(
    content.categoryComparisons.map((c) => ({ ...c, totalMinor: c.currentMinor })),
  )
    .map((group) => ({ name: group.categoryName, value: Math.abs(group.totalMinor) }))
    .filter((part) => part.value > 0);
  return (
    <Card title="Where it went">
      <div className="mt-2">
        <CategoryDonut parts={parts} legend size={120} />
      </div>
    </Card>
  );
}

function LargestPurchases({ content }: { content: MonthlyContent }): React.JSX.Element | null {
  if (content.largestPurchases.length === 0) return null;
  return (
    <Card title="Largest purchases">
      <ListRows>
        {content.largestPurchases.slice(0, 5).map((p) => (
          <ListRow key={p.id}>
            <MerchantMark name={p.merchantName} />
            <span className="flex-1">{p.merchantName}</span>
            <span className="ds-num">{spend(p.amountMinor)}</span>
          </ListRow>
        ))}
      </ListRows>
    </Card>
  );
}

function IfNothingChanges({ content }: { content: MonthlyContent }): React.JSX.Element {
  const count = content.recurringAudit.length;
  return (
    <Card title="If nothing changes">
      <div className="ds-stat-value ds-num">{spend(content.projectedAnnualSpendingMinor)}</div>
      {/* FR-041: every projection states its assumption. */}
      <div className="ds-faint mt-1 text-[12px]">{content.projectionAssumption}</div>
      {count > 0 && (
        <div className="ds-row mt-3">
          <Chip>{count === 1 ? '1 subscription' : `${count} subscriptions`}</Chip>
        </div>
      )}
    </Card>
  );
}

function Recurring({ content }: { content: MonthlyContent }): React.JSX.Element | null {
  if (content.recurringAudit.length === 0) return null;
  return (
    <Card title="Recurring charges">
      <ListRows>
        {content.recurringAudit.map((r) => (
          <ListRow key={r.merchantKey}>
            <MerchantMark name={r.merchantName} />
            <span className="flex-1">{r.merchantName}</span>
            <Chip>{r.cadence}</Chip>
            <span className="ds-num">{spend(r.currentAmountMinor)}</span>
            <span className="ds-num ds-faint w-40 text-right text-[12px]">
              paid so far {spend(r.cumulativePaidMinor)}
            </span>
          </ListRow>
        ))}
      </ListRows>
    </Card>
  );
}

export function MonthlyBody({
  content,
  history,
}: {
  content: MonthlyContent;
  history: readonly KpiPoint[];
}): React.JSX.Element {
  return (
    <>
      <div className="ds-grid grid-cols-4">
        {kpiTiles(content, history).map((tile) => (
          <Stat key={tile.label} {...tile} />
        ))}
      </div>
      <div className={TWO_COLUMNS}>
        <WhereItWent content={content} />
        <Card title={`Versus ${previousMonthName(history)}`}>
          <ComparisonList rows={content.categoryComparisons} />
        </Card>
      </div>
      <div className={TWO_COLUMNS}>
        <LargestPurchases content={content} />
        <IfNothingChanges content={content} />
      </div>
      <Recurring content={content} />
    </>
  );
}
