import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { money, moneyCompact } from '../lib/format';
import {
  ACCENT,
  GRID_STROKE,
  LABEL_TICK,
  POSITIVE,
  TOOLTIP_CURSOR,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
  VALUE_TICK,
} from './theme';

export interface IncomeSpendingPoint {
  readonly label: string;
  /** Minor units. */
  readonly income: number;
  readonly spending: number;
}

const SERIES = [
  { key: 'income', name: 'Income', color: POSITIVE },
  { key: 'spending', name: 'Spending', color: ACCENT },
] as const;

export function IncomeVsSpending({
  data,
  height = 150,
}: {
  data: readonly IncomeSpendingPoint[];
  height?: number;
}): React.JSX.Element {
  return (
    <figure className="m-0">
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...data]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={3}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="label"
              tick={LABEL_TICK}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
            />
            <YAxis
              tick={VALUE_TICK}
              tickLine={false}
              axisLine={false}
              width={46}
              tickFormatter={(v: number) => moneyCompact(v)}
            />
            <Tooltip
              cursor={TOOLTIP_CURSOR}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              formatter={(v) => money(Number(v))}
            />
            {SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={s.color}
                fillOpacity={0.85}
                radius={4}
                maxBarSize={22}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="ds-row" style={{ fontSize: 11.5, gap: 14 }}>
        {SERIES.map((s) => (
          <span key={s.key} className="ds-row" style={{ gap: 5 }}>
            <i
              aria-hidden
              style={{ width: 7, height: 7, borderRadius: '50%', background: s.color }}
            />
            {s.name}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
