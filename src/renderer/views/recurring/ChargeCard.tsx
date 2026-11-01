import { Card, MerchantMark } from '../../components/ui';
import { Money } from '../../components/Money';
import { Sparkline } from '../../charts/Sparkline';
import { categoryColor } from '../../lib/categoryColor';

export interface ChargeSummary {
  readonly markName: string;
  readonly name: React.ReactNode;
  readonly subtitle: string;
  readonly amountMinor: number;
  readonly history: readonly number[];
}

interface ChargeCardProps {
  readonly summary: ChargeSummary;
  readonly footer: React.ReactNode;
  readonly children: React.ReactNode;
}

/** One recurring charge: mark, name, price, price history, a footer line and actions. */
export function ChargeCard({ summary, footer, children }: ChargeCardProps): React.JSX.Element {
  const { markName, name, subtitle, amountMinor, history } = summary;
  return (
    <Card className="flex flex-col gap-2.5">
      <div className="ds-row">
        <MerchantMark name={markName} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{name}</div>
          <div className="ds-caption">{subtitle}</div>
        </div>
        <Money minor={amountMinor} magnitude className="ds-num text-[16px] font-semibold" />
      </div>
      <Sparkline values={history} color={categoryColor(markName)} width={300} height={34} />
      <div className="ds-row text-[11.5px]">{footer}</div>
      <div className="ds-row">{children}</div>
    </Card>
  );
}
