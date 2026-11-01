import { Card } from './ui';
import { RunwayChart } from '../charts/RunwayChart';
import { money } from '../lib/format';

/**
 * The runway card.
 *
 * The one thing the whole product is about: does the balance survive to the
 * next payday. Constitution IX: when income is unknown the card does not
 * guess. It says so. FR-041: every projection states its assumption.
 */
export function Runway({
  available,
  projectedMinor,
  reason,
  series,
}: {
  available: boolean;
  projectedMinor: number | null;
  reason: string;
  series: { points: Array<{ date: string; balanceMinor: number }>; floorMinor: number } | null;
}): React.JSX.Element {
  if (!available || projectedMinor === null || !series) {
    return (
      <Card title="Runway to payday">
        <p className="ds-muted" style={{ margin: '10px 0 0' }}>
          {reason}
        </p>
      </Card>
    );
  }
  return (
    <Card title="Runway to payday" caption={reason}>
      <RunwayChart
        points={series.points.map((p) => ({ date: p.date, balance: p.balanceMinor }))}
        floor={series.floorMinor}
        label={`${money(projectedMinor)} on payday`}
      />
    </Card>
  );
}
