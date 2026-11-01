import { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { axisMoney, axisPeriod, money } from '../lib/format';
import { Segmented } from '../components/ui';
import { trackAction } from '../lib/ipc';
import { BarGradients } from './BarGradients';
import {
  ACCENT,
  AVERAGE_STROKE,
  BAR_FADED_GRADIENT_ID,
  BAR_GRADIENT_ID,
  GRID_STROKE,
  LABEL_TICK,
  TOOLTIP_CURSOR,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
  VALUE_TICK,
} from './theme';

/**
 * Spending over time (FR-065).
 *
 * ONE series, deliberately. The prior-period figure is a reference baseline,
 * not a peer category, so it is drawn as a dashed reference line rather than a
 * second colour. The latest period is faded: it is still in progress.
 */

export interface SpendingPoint {
  readonly label: string;
  /** Positive magnitude in minor units — spending is charted as a magnitude. */
  readonly spendingMinor: number;
}

export function SpendingOverTime({
  data,
  priorAverageMinor,
  title,
  onSelectPeriod,
}: {
  data: readonly SpendingPoint[];
  priorAverageMinor: number | null;
  title: string;
  /** Clicking a period drills into that month's transactions. */
  onSelectPeriod?: (label: string) => void;
}): React.JSX.Element {
  const [shape, setShape] = useState<'bars' | 'line'>('bars');
  if (data.length === 0) {
    return (
      <p className="rounded-[12px] border border-dashed border-[var(--color-line)] px-4 py-8 text-center text-[13px] text-[var(--color-ink-faint)]">
        Not enough history yet to chart.
      </p>
    );
  }

  return (
    <figure className="m-0">
      {/* A single series needs no legend; the title names it. */}
      <figcaption className="mb-3 flex items-center justify-between text-[13px] font-semibold">
        <span>{title}</span>
        <span className="flex items-center gap-3 text-[12px] font-normal">
          {onSelectPeriod && (
            <span className="text-[var(--color-ink-faint)]">Click a period to open it</span>
          )}
          <Segmented
            label="Chart shape"
            value={shape}
            onChange={(next) => {
              setShape(next);
              trackAction('ui:chart-mode');
            }}
            options={[
              { value: 'bars', label: 'Bars' },
              { value: 'line', label: 'Line' },
            ]}
          />
        </span>
      </figcaption>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={[...data]}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            onClick={(state) => {
              if (typeof state.activeLabel === 'string') onSelectPeriod?.(state.activeLabel);
            }}
            style={{ cursor: onSelectPeriod ? 'pointer' : 'default' }}
          >
            <BarGradients />
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="label"
              tick={LABEL_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={axisPeriod}
            />
            <YAxis
              tick={VALUE_TICK}
              tickLine={false}
              axisLine={false}
              width={46}
              tickFormatter={axisMoney}
            />
            <Tooltip
              cursor={
                shape === 'line'
                  ? { stroke: GRID_STROKE, strokeDasharray: '3 3' }
                  : TOOLTIP_CURSOR
              }
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              formatter={(v) => [money(Number(v)), 'Spent']}
            />
            {priorAverageMinor !== null && (
              <ReferenceLine
                y={priorAverageMinor}
                stroke={AVERAGE_STROKE}
                strokeDasharray="4 4"
                strokeWidth={1.2}
                label={{
                  value: `avg ${money(priorAverageMinor)}`,
                  position: 'insideTopRight',
                  fill: AVERAGE_STROKE,
                  fontSize: 10,
                }}
              />
            )}
            {shape === 'bars' ? (
              <Bar dataKey="spendingMinor" radius={5} maxBarSize={44}>
                {data.map((point, index) => (
                  <Cell
                    key={point.label}
                    fill={`url(#${index === data.length - 1 ? BAR_FADED_GRADIENT_ID : BAR_GRADIENT_ID})`}
                  />
                ))}
              </Bar>
            ) : (
              <Line
                type="monotone"
                dataKey="spendingMinor"
                stroke={ACCENT}
                strokeWidth={2}
                dot={{ r: 4, fill: ACCENT, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
