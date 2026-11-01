import { Card, ListRow, ListRows } from '../../components/ui';
import { CategoryBars } from '../../charts/CategoryBars';
import { spend } from '../../lib/format';
import { rollUp } from './rollUp';
import type { DigestContent } from './detailTypes';

function WorthNoticing({ claims }: { claims: DigestContent['deviations'] }): React.JSX.Element {
  return (
    <Card title="Worth noticing">
      <ul className="ds-muted m-0 mt-2 flex list-none flex-col gap-1 p-0">
        {claims.map((d) => (
          <li key={d.categoryId}>
            <span className="text-[var(--color-ink)]">{d.categoryName}</span> was{' '}
            {d.multiple ? `${d.multiple.toFixed(1)}×` : ''} {d.direction} your normal range at{' '}
            <span className="ds-num">{spend(d.actualMinor)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function DigestBody({ content }: { content: DigestContent }): React.JSX.Element {
  if (!content.hadActivity) {
    return (
      <Card>
        <p className="ds-faint py-6 text-center">No activity in this period.</p>
      </Card>
    );
  }

  // Only deviations with a claim are shown: without enough history the system
  // states totals and says nothing comparative (FR-040).
  const claims = content.deviations.filter((d) => d.hasClaim);

  return (
    <>
      {claims.length > 0 && <WorthNoticing claims={claims} />}
      <Card>
        <CategoryBars data={rollUp(content.categoryTotals)} title="Spending this period" />
      </Card>
      <Card>
        <ListRows>
          {content.categoryTotals.map((c) => (
            <ListRow key={c.categoryId}>
              <span className="flex-1">{c.categoryName}</span>
              <span className="ds-num">{spend(c.totalMinor)}</span>
            </ListRow>
          ))}
        </ListRows>
      </Card>
      {claims.length === 0 && (
        <p className="ds-faint text-[12px]">
          No comparisons yet — a few more weeks of history are needed before deviations mean
          anything.
        </p>
      )}
    </>
  );
}
