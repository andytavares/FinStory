import { useState } from 'react';
import { call } from '../../lib/ipc';
import { Card, Segmented } from '../../components/ui';
import type { AppSettings } from '@shared/types';

const RETENTION_OPTIONS = [
  { value: '365', label: '1 year' },
  { value: 'forever', label: 'Forever' },
] as const;

export function GeneralSection({ settings }: { settings: AppSettings }): React.JSX.Element {
  const [retention, setRetention] = useState(settings.usageRetention);
  const choose = (next: AppSettings['usageRetention']): void => {
    setRetention(next);
    void call('settings:update', { usageRetention: next });
  };

  return (
    <>
      <Card>
        <div className="ds-row">
          <div className="flex-1">
            <div className="font-semibold">Check for new transactions every</div>
            <div className="ds-caption">
              Alerts arrive within one interval while the app is running, and everything missed is
              delivered on next launch.
            </div>
          </div>
          <span className="ds-num">{settings.pollIntervalMinutes} min</span>
        </div>
      </Card>
      <Card>
        <div className="ds-row">
          <div className="flex-1">
            <div className="font-semibold">Usage history</div>
            <div className="ds-caption">How long Money keeps its usage log on this Mac.</div>
          </div>
          <span className="ds-muted">Keep usage history:</span>
          <Segmented
            label="Keep usage history"
            options={RETENTION_OPTIONS}
            value={retention}
            onChange={choose}
          />
        </div>
      </Card>
    </>
  );
}
