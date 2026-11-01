import { Area, AreaChart, ReferenceDot, XAxis, YAxis } from 'recharts';

function areaProps(color: string) {
  return {
    dataKey: 'value',
    type: 'linear',
    stroke: color,
    strokeWidth: 1.6,
    fill: color,
    fillOpacity: 0.12,
    dot: false,
    isAnimationActive: false,
  } as const;
}

/** Area, line and an end dot; fixed size, meant to sit inside a Stat. */
export function Sparkline({
  values,
  color,
  width = 120,
  height = 30,
}: {
  values: readonly number[];
  color: string;
  width?: number;
  height?: number;
}): React.JSX.Element | null {
  if (values.length < 2) return null;
  const data = values.map((value, index) => ({ index, value }));
  const last = data.length - 1;
  return (
    <AreaChart
      width={width}
      height={height}
      data={data}
      margin={{ top: 3, right: 3, bottom: 3, left: 3 }}
    >
      <XAxis dataKey="index" hide />
      <YAxis hide domain={['dataMin', 'dataMax']} />
      <Area {...areaProps(color)} />
      <ReferenceDot x={last} y={values[last] ?? 0} r={2.6} fill={color} stroke="none" />
    </AreaChart>
  );
}
