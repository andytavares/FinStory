import { useEffect, useState } from 'react';
import { useQuery, call } from '../lib/ipc';

interface UsageSummary {
  readonly totalEvents: number;
  readonly previousTotal: number;
  readonly featuresUsed: number;
  readonly featuresTotal: number;
  readonly neverUsed: ReadonlyArray<{ id: string; label: string; group: string }>;
  readonly activeDays: number;
  readonly byFeature: ReadonlyArray<{ id: string; label: string; count: number }>;
}

interface UsageEvent {
  readonly id: number;
  readonly occurredAt: string;
  readonly label: string;
  readonly outcome: 'success' | 'failure';
  readonly durationMs: number | null;
}

const PERIODS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: 'All', days: null },
] as const;

const STREAM_LIMIT = 50;

function Stat({ label, value }: { label: string; value: string | number }): React.JSX.Element {
  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
      <p className="text-[12px] text-[var(--color-ink-faint)]">{label}</p>
      <p className="numeric text-[20px]">{value}</p>
    </div>
  );
}

function LiveStream(): React.JSX.Element {
  const recent = useQuery<UsageEvent[]>('usage:recent', { limit: STREAM_LIMIT });
  const [live, setLive] = useState<UsageEvent[]>([]);

  useEffect(
    () => window.money.on('usage:event', (event) => setLive((prev) => [event as UsageEvent, ...prev].slice(0, STREAM_LIMIT))),
    [],
  );

  const seen = new Set(live.map((e) => e.id));
  const events = [...live, ...(recent.data ?? []).filter((e) => !seen.has(e.id))].slice(0, STREAM_LIMIT);
  return (
    <section className="space-y-2">
      <p className="eyebrow">Live</p>
      <ul data-testid="usage-stream" className="space-y-1 text-[12px]">
        {events.map((e) => (
          <li key={e.id} className="flex gap-3">
            <span className="numeric text-[var(--color-ink-faint)]">{e.occurredAt.slice(11, 19)}</span>
            <span>{e.label}</span>
            {e.outcome === 'failure' && <span className="text-[var(--color-negative)]">failed</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FeatureBars({ summary }: { summary: UsageSummary }): React.JSX.Element {
  const max = Math.max(1, ...summary.byFeature.map((f) => f.count));
  return (
    <section className="space-y-2">
      <p className="eyebrow">Most and least used</p>
      <ul className="space-y-1 text-[12px]">
        {summary.byFeature.map((f) => (
          <li key={f.id} className="flex items-center gap-3">
            <span className="w-56 truncate">{f.label}</span>
            <span
              className="h-2"
              style={{
                width: `${(f.count / max) * 240 + 2}px`,
                background: f.count === 0 ? 'var(--color-warning, #d99a2b)' : 'var(--color-ink-muted)',
              }}
            />
            <span className="numeric text-[var(--color-ink-faint)]">{f.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Usage(): React.JSX.Element {
  const [days, setDays] = useState<7 | 30 | null>(30);
  const summary = useQuery<UsageSummary>('usage:summary', { days });
  const [message, setMessage] = useState<string | null>(null);

  const exportCsv = (): void => {
    void call<{ ok: boolean; path?: string }>('usage:export')
      .then((r) => setMessage(r.ok ? 'Exported.' : null))
      .catch((e: { message?: string }) => setMessage(e.message ?? 'That did not work'));
  };

  const s = summary.data;
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px]">Usage</h1>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button key={p.label} type="button" aria-pressed={days === p.days} onClick={() => setDays(p.days)} className="btn">
              {p.label}
            </button>
          ))}
          <button type="button" onClick={exportCsv} className="btn">
            Export CSV
          </button>
        </div>
      </div>
      {message && <p className="text-[12px] text-[var(--color-ink-faint)]">{message}</p>}
      <p className="text-[12px] text-[var(--color-ink-faint)]">Stored on this machine only. Nothing is sent anywhere.</p>

      {s && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Events" value={s.totalEvents} />
            <Stat label="Features used" value={`${s.featuresUsed} of ${s.featuresTotal}`} />
            <Stat label="Never used" value={s.neverUsed.length} />
            <Stat label="Active days" value={s.activeDays} />
          </div>
          <FeatureBars summary={s} />
          <section className="space-y-2">
            <p className="eyebrow">Never used</p>
            <p className="text-[12px] text-[var(--color-ink-faint)]">
              {s.neverUsed.map((f) => f.label).join(' · ') || 'Every feature was used.'}
            </p>
          </section>
        </>
      )}
      <LiveStream />
    </div>
  );
}
