import {
  Area,
  ComposedChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { axisDay, axisMoney, moneyCompact } from '../lib/format';
import {
  FLOOR_FILL,
  FLOOR_STROKE,
  FLOOR_TEXT,
  GROUND,
  INK,
  LABEL_TICK,
  POSITIVE,
  VALUE_TICK,
} from './theme';

export interface RunwayPoint {
  readonly date: string;
  /** Minor units. */
  readonly balance: number;
}

const GRADIENT_ID = 'ds-runway-gradient';

export function RunwayChart({
  points,
  floor,
  label,
  height = 150,
}: {
  points: readonly RunwayPoint[];
  floor: number;
  label: string;
  height?: number;
}): React.JSX.Element {
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={[...points]} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={POSITIVE} stopOpacity={0.25} />
              <stop offset="1" stopColor={POSITIVE} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={LABEL_TICK} tickLine={false} axisLine={false} tickFormatter={axisDay} minTickGap={24} />
          <YAxis
            tick={VALUE_TICK}
            tickLine={false}
            axisLine={false}
            width={46}
            domain={[0, 'auto']}
            tickFormatter={axisMoney}
          />
          <ReferenceArea y1={0} y2={floor} fill={FLOOR_FILL} stroke="none" />
          <ReferenceLine
            y={floor}
            stroke={FLOOR_STROKE}
            strokeDasharray="3 4"
            label={{ value: `floor ${moneyCompact(floor)}`, position: 'insideBottomLeft', fill: FLOOR_TEXT, fontSize: 10 }}
          />
          <Area
            dataKey="balance"
            type="linear"
            stroke={POSITIVE}
            strokeWidth={2}
            fill={`url(#${GRADIENT_ID})`}
            dot={false}
            isAnimationActive={false}
          />
          {first && <ReferenceDot x={first.date} y={first.balance} r={4} fill={POSITIVE} stroke="none" />}
          {last && (
            <ReferenceDot
              x={last.date}
              y={last.balance}
              r={4}
              fill={GROUND}
              stroke={POSITIVE}
              strokeWidth={2}
              label={{ value: label, position: 'left', offset: 10, fill: INK, fontSize: 11 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
