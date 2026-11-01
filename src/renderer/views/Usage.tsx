import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { Button, Chip, PageHeader, Segmented } from '../components/ui';
import { FeatureBars } from './usage/FeatureBars';
import { LiveStream } from './usage/LiveStream';
import { UsageStats } from './usage/UsageStats';
import type { UsageSummary } from './usage/types';

type Period = '7' | '30' | 'all';

const PERIOD_DAYS: Record<Period, 7 | 30 | null> = { '7': 7, '30': 30, all: null };

export function Usage(): React.JSX.Element {
  const [period, setPeriod] = useState<Period>('30');
  const days = PERIOD_DAYS[period];
  const summary = useQuery<UsageSummary>('usage:summary', { days });
  const [message, setMessage] = useState<string | null>(null);

  const exportCsv = (): void => {
    void call<{ ok: boolean; path?: string }>('usage:export')
      .then((r) => setMessage(r.ok ? 'Exported.' : null))
      .catch((e: { message?: string }) => setMessage(e.message ?? 'That did not work'));
  };

  const s = summary.data;
  return (
    <div className="flex flex-col gap-[14px]">
      <PageHeader
        title="Usage"
        sub="Recorded on this Mac only. Nothing is sent anywhere."
        actions={
          <>
            <Chip tone="ok">● Live</Chip>
            <Segmented<Period>
              label="Period"
              value={period}
              onChange={setPeriod}
              options={[
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
                { value: 'all', label: 'All' },
              ]}
            />
            <Button onClick={exportCsv}>Export CSV</Button>
          </>
        }
      />
      {message && <p className="ds-faint text-[12px]">{message}</p>}
      {s && <UsageStats summary={s} days={days} />}
      <div className="ds-grid grid-cols-[1.3fr_1fr]">
        {s ? <FeatureBars summary={s} /> : <div />}
        <LiveStream />
      </div>
    </div>
  );
}
