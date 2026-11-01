import { call } from '../../lib/ipc';
import { Button, Card, Chip, Eyebrow, MerchantMark } from '../../components/ui';
import { Money } from '../../components/Money';
import { Sparkline } from '../../charts/Sparkline';
import { CADENCE_LABEL } from '../recurring/cadence';
import type { DatedIncomeSource } from './types';

function nextDepositLine(source: DatedIncomeSource): string {
  const date = new Date(source.nextExpectedDate).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const days = source.daysUntilNext;
  return `${date} · ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`;
}

/** One income source: next deposit, status, and the confirm / see / not-income actions. */
export function SourceCard({
  source,
  onChanged,
  onOpenMerchant,
}: {
  source: DatedIncomeSource;
  onChanged: () => void;
  onOpenMerchant: (merchantKey: string) => void;
}): React.JSX.Element {
  const run = (channel: string): void => void call(channel, { id: source.id }).then(onChanged);
  return (
    <Card>
      <div className="ds-row">
        <MerchantMark name={source.merchantName} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{source.merchantName}</div>
          <div className="ds-caption">{CADENCE_LABEL[source.cadence] ?? source.cadence}</div>
        </div>
        {source.isUserConfirmed ? (
          <Chip tone="ok">Confirmed</Chip>
        ) : (
          <Chip tone="warn">Detected · {Math.round(source.detectionConfidence * 100)}%</Chip>
        )}
      </div>
      <div className="ds-row mt-3.5 items-end">
        <div>
          <Eyebrow>Next deposit</Eyebrow>
          <Money minor={source.expectedAmountMinor} direction className="ds-num block text-[22px] font-semibold" />
          <div className="ds-caption">{nextDepositLine(source)}</div>
        </div>
        <div className="ml-auto">
          <Sparkline values={Array(8).fill(source.expectedAmountMinor) as number[]} color="var(--color-positive)" width={180} height={40} />
        </div>
      </div>
      <div className="ds-row mt-3">
        {!source.isUserConfirmed && (
          <Button size="sm" variant="primary" onClick={() => run('income:confirm')}>
            Confirm
          </Button>
        )}
        <Button size="sm" onClick={() => onOpenMerchant(source.merchantKey)}>
          See deposits
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => run('income:clearOverride')}>
          Not income
        </Button>
      </div>
    </Card>
  );
}
