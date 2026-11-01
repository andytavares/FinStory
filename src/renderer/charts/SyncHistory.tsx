export interface SyncRun {
  readonly ok: boolean;
  /** Size of a successful run (for example its duration); bars scale to the largest. 0 means unknown. */
  readonly value: number;
}

const BAR_AREA_PX = 70;
const UNKNOWN_SIZE_PX = 63;
const MIN_BAR_PX = 18;

function barHeight(run: SyncRun, largest: number): number {
  if (!run.ok) return BAR_AREA_PX;
  if (largest === 0) return UNKNOWN_SIZE_PX;
  return Math.max(MIN_BAR_PX, (run.value / largest) * BAR_AREA_PX);
}

export function SyncHistory({ runs }: { runs: readonly SyncRun[] }): React.JSX.Element {
  const largest = Math.max(0, ...runs.filter((run) => run.ok).map((run) => run.value));
  return (
    <div className="ds-row" style={{ gap: 4, alignItems: 'flex-end', height: BAR_AREA_PX }}>
      {runs.map((run, index) => (
        <i
          key={index}
          role="img"
          aria-label={run.ok ? 'Succeeded' : 'Failed'}
          style={{
            flex: 1,
            display: 'block',
            borderRadius: 3,
            height: barHeight(run, largest),
            background: run.ok ? 'rgba(61, 220, 151, 0.75)' : 'rgba(255, 122, 133, 0.8)',
          }}
        />
      ))}
    </div>
  );
}
