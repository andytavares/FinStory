export interface SyncRun {
  readonly ok: boolean;
  /** Transactions pulled; sets the bar height of a successful run. */
  readonly value: number;
}

const BAR_AREA_PX = 70;
const PX_PER_VALUE = 7;

export function SyncHistory({ runs }: { runs: readonly SyncRun[] }): React.JSX.Element {
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
            height: run.ok ? Math.min(BAR_AREA_PX, run.value * PX_PER_VALUE) : BAR_AREA_PX,
            background: run.ok ? 'rgba(61, 220, 151, 0.75)' : 'rgba(255, 122, 133, 0.8)',
          }}
        />
      ))}
    </div>
  );
}
