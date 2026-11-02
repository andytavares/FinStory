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
  LABEL_TICK,
  POSITIVE,
  VALUE_TICK,
} from './theme';

export interface RunwayPoint {
  /** YYYY-MM-DD; the axis formats it, and any other text throws. */
  readonly date: string;
  /** Minor units. */
  readonly balance: number;
}

const GRADIENT_ID = 'ds-runway-gradient';

const X_AXIS = {
  dataKey: 'date',
  tick: LABEL_TICK,
  tickLine: false,
  axisLine: false,
  tickFormatter: axisDay,
  minTickGap: 24,
} as const;

const Y_AXIS = {
  tick: VALUE_TICK,
  tickLine: false,
  axisLine: false,
  width: 46,
  domain: [0, 'auto'],
  tickFormatter: axisMoney,
} as const;

const BALANCE_AREA = {
  dataKey: 'balance',
  type: 'linear',
  stroke: POSITIVE,
  strokeWidth: 2,
  fill: `url(#${GRADIENT_ID})`,
  dot: false,
  isAnimationActive: false,
} as const;

function floorLabel(floor: number) {
  return {
    value: `floor ${moneyCompact(floor)}`,
    position: 'insideBottomLeft',
    fill: FLOOR_TEXT,
    fontSize: 10,
  } as const;
}

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
    <div style={{ width: '100%' }}>
      <div className="ds-num" style={{ textAlign: 'right', fontSize: 11 }}>
        {label}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {/* Right margin leaves room for the last date tick. */}
          <ComposedChart data={[...points]} margin={{ top: 12, right: 24, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={POSITIVE} stopOpacity={0.25} />
                <stop offset="1" stopColor={POSITIVE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis {...X_AXIS} />
            <YAxis {...Y_AXIS} />
            <ReferenceArea y1={0} y2={floor} fill={FLOOR_FILL} stroke="none" />
            <ReferenceLine
              y={floor}
              stroke={FLOOR_STROKE}
              strokeDasharray="3 4"
              ifOverflow="extendDomain"
              label={floorLabel(floor)}
            />
            <Area {...BALANCE_AREA} />
            {first && (
              <ReferenceDot x={first.date} y={first.balance} r={4} fill={POSITIVE} stroke="none" />
            )}
            {last && (
              <ReferenceDot
                x={last.date}
                y={last.balance}
                r={4}
                fill={GROUND}
                stroke={POSITIVE}
                strokeWidth={2}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
