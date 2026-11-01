import { useEffect, useState } from 'react';
import { useQuery } from '../../lib/ipc';
import { Card, Chip } from '../../components/ui';
import type { UsageEvent } from './types';

const STREAM_LIMIT = 50;

/** "now", "12 s", "3 m", "2 h", "4 d". */
function shortAge(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${Math.floor(seconds)} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 86_400)} d`;
}

export function LiveStream(): React.JSX.Element {
  const recent = useQuery<UsageEvent[]>('usage:recent', { limit: STREAM_LIMIT });
  const [live, setLive] = useState<UsageEvent[]>([]);

  useEffect(
    () => window.money.on('usage:event', (event) => setLive((prev) => [event as UsageEvent, ...prev].slice(0, STREAM_LIMIT))),
    [],
  );

  const seen = new Set(live.map((e) => e.id));
  const events = [...live, ...(recent.data ?? []).filter((e) => !seen.has(e.id))].slice(0, STREAM_LIMIT);
  return (
    <Card title="Live" caption="newest first">
      <ul data-testid="usage-stream" className="m-0 flex max-h-[360px] list-none flex-col divide-y divide-[var(--color-line)] overflow-y-auto p-0 text-[12px]">
        {events.map((e) => (
          <li key={e.id} className="ds-row py-[7px]">
            <span className="ds-num ds-faint w-9">{shortAge(e.occurredAt)}</span>
            <span className="ds-num flex-1">{e.feature}</span>
            {e.outcome === 'failure' && <Chip tone="bad">failed</Chip>}
            <Chip>{e.label}</Chip>
          </li>
        ))}
      </ul>
    </Card>
  );
}
