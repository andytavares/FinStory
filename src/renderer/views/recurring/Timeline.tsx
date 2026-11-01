import { Card, MerchantMark } from '../../components/ui';
import { Money } from '../../components/Money';
import { money } from '../../lib/format';
import type { RecurringChargeView } from '@shared/types';

const DAY_MS = 86_400_000;
const HORIZON_DAYS = 30;
const TICK_DAYS = [0, 10, 20, 30];

function dayLabel(from: Date, offsetDays: number): string {
  return new Date(from.getTime() + offsetDays * DAY_MS).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function daysFrom(today: Date, isoDate: string): number {
  return Math.round((new Date(`${isoDate}T00:00:00Z`).getTime() - today.getTime()) / DAY_MS);
}

/** Charges due in the next 30 days, placed along a line by date. */
export function Timeline({
  charges,
  today,
}: {
  charges: readonly RecurringChargeView[];
  today: Date;
}): React.JSX.Element | null {
  const start = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const due = charges
    .map((c) => ({ charge: c, day: daysFrom(start, c.nextExpectedDate) }))
    .filter(({ day }) => day >= 0 && day <= HORIZON_DAYS);
  if (due.length === 0) return null;
  const total = due.reduce((sum, { charge }) => sum + Math.abs(charge.currentAmountMinor), 0);

  return (
    <Card title="Next 30 days" caption={`${money(total)} due`}>
      <div className="relative mt-2.5" style={{ height: 56 }} data-testid="timeline">
        <div
          className="absolute left-0 right-0"
          style={{ top: 27, height: 2, background: 'var(--color-line-strong)' }}
        />
        {due.map(({ charge, day }) => (
          <div
            key={charge.id}
            className="absolute text-center"
            style={{ left: `${(day / HORIZON_DAYS) * 100}%`, top: 12, transform: 'translateX(-50%)' }}
          >
            <MerchantMark name={charge.merchantName} />
            <div className="ds-num ds-caption mt-[3px]" style={{ fontSize: 10.5 }}>
              <Money minor={charge.currentAmountMinor} magnitude />
            </div>
          </div>
        ))}
        {TICK_DAYS.map((d) => (
          <span
            key={d}
            className="ds-num ds-caption absolute whitespace-nowrap"
            style={{
              left: `${(d / HORIZON_DAYS) * 100}%`,
              top: 0,
              fontSize: 10,
              transform: `translateX(${d === HORIZON_DAYS ? '-100%' : d ? '-50%' : '0'})`,
            }}
          >
            {dayLabel(start, d)}
          </span>
        ))}
      </div>
    </Card>
  );
}
