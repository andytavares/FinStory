import { Card, MerchantMark } from '../../components/ui';
import { money, shortDate } from '../../lib/format';
import type { DashboardExtras } from '@shared/types';

export function ComingUp({
  charges,
}: {
  charges: DashboardExtras['upcomingRecurring'];
}): React.JSX.Element {
  return (
    <Card title="Coming up">
      {charges.length === 0 ? (
        <p className="ds-muted" style={{ margin: '10px 0 0' }}>
          No recurring charges are due soon.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {charges.map((charge) => (
            <li key={`${charge.merchantName}-${charge.date}`} className="ds-row" style={{ padding: '7px 0' }}>
              <MerchantMark name={charge.merchantName} />
              <span style={{ flex: 1 }}>
                {charge.merchantName}
                <br />
                <span className="ds-faint" style={{ fontSize: 11.5 }}>
                  {shortDate(`${charge.date}T12:00:00`)}
                </span>
              </span>
              <span className="ds-num">{money(charge.amountMinor)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
