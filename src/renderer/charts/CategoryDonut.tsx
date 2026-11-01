import { Cell, Pie, PieChart } from 'recharts';
import { categoryColor } from '../lib/categoryColor';
import { money } from '../lib/format';

export interface DonutPart {
  readonly name: string;
  /** Minor units. */
  readonly value: number;
}

const RING = {
  innerRadius: '64%',
  outerRadius: '100%',
  paddingAngle: 1.5,
  startAngle: 90,
  endAngle: -270,
  stroke: 'none',
  isAnimationActive: false,
} as const;

function DonutLegend({ parts }: { parts: readonly DonutPart[] }): React.JSX.Element {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
      {parts.map((part, index) => (
        <div key={part.name} className="ds-row">
          <i
            aria-hidden
            style={{ width: 7, height: 7, borderRadius: '50%', background: categoryColor(index) }}
          />
          <span style={{ flex: 1 }}>{part.name}</span>
          <span className="ds-num ds-muted">{money(part.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function CategoryDonut({
  parts,
  legend = false,
  size = 132,
}: {
  parts: readonly DonutPart[];
  legend?: boolean;
  size?: number;
}): React.JSX.Element {
  return (
    <div className="ds-row" style={{ gap: 18 }}>
      <PieChart width={size} height={size}>
        <Pie data={[...parts]} dataKey="value" nameKey="name" {...RING}>
          {parts.map((part, index) => (
            <Cell key={part.name} fill={categoryColor(index)} />
          ))}
        </Pie>
      </PieChart>
      {legend && <DonutLegend parts={parts} />}
    </div>
  );
}
