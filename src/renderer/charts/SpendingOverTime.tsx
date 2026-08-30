import { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { moneyCompact, money } from '../lib/format';

/**
 * Spending over time (FR-065).
 *
 * ONE series, deliberately. The prior-period figure is a reference baseline,
 * not a peer category, so it is drawn as a reference line rather than a second
 * colour. That keeps identity unambiguous without a legend, and avoids
 * borrowing a reserved status colour for a data series.
 *
 * Series colour #4897cd was validated against this app's dark surface
 * (#161e26) with the dataviz validator: passes lightness band, chroma floor,
 * and 3:1 contrast. Do not adjust it by eye.
 */

const SERIES = '#4897cd';
const INK_FAINT = 'oklch(0.56 0.02 250)';
const LINE = 'oklch(0.34 0.02 250)';

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
      <p className="border border-dashed border-[var(--color-line)] px-4 py-8 text-center text-[13px] text-[var(--color-ink-faint)]">
        Not enough history yet to chart.
      </p>
    );
  }

  return (
    <figure className="m-0">
      {/* A single series needs no legend; the title names it. */}
      <figcaption className="mb-3 flex items-baseline justify-between text-[15px]">
        <span>{title}</span>
        <span className="flex items-center gap-3 text-[12px] font-normal">
          {onSelectPeriod && (
            <span className="text-[var(--color-ink-faint)]">Click a period to open it</span>
          )}
          <span className="flex border border-[var(--color-line)]">
            {(['bars', 'line'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setShape(s)}
                aria-pressed={shape === s}
                className={`px-2 py-0.5 ${
                  shape === s
                    ? 'bg-[var(--color-surface-raised)] text-[var(--color-ink)]'
                    : 'text-[var(--color-ink-faint)]'
                }`}
              >
                {s === 'bars' ? 'Bars' : 'Line'}
              </button>
            ))}
          </span>
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
            <CartesianGrid stroke={LINE} strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="label"
              stroke={INK_FAINT}
              tickLine={false}
              axisLine={{ stroke: LINE }}
              fontSize={11}
            />
            <YAxis
              stroke={INK_FAINT}
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={56}
              tickFormatter={(v: number) => moneyCompact(v)}
            />
            <Tooltip
              cursor={
                shape === 'line'
                  ? { stroke: INK_FAINT, strokeDasharray: '3 3' }
                  : { fill: 'oklch(0.27 0.02 250)' }
              }
              contentStyle={{
                background: 'oklch(0.23 0.02 250)',
                border: `1px solid ${LINE}`,
                borderRadius: 0,
                fontSize: 12,
              }}
              labelStyle={{ color: INK_FAINT }}
              formatter={(v) => [money(Number(v)), 'Spent']}
            />
            {priorAverageMinor !== null && (
              <ReferenceLine
                y={priorAverageMinor}
                stroke={INK_FAINT}
                strokeDasharray="3 3"
                label={{
                  value: 'your average',
                  position: 'insideTopRight',
                  fill: INK_FAINT,
                  fontSize: 11,
                }}
              />
            )}
            {/* 4px rounded data-end anchored to the baseline. */}
            {shape === 'bars' ? (
              <Bar dataKey="spendingMinor" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={44} />
            ) : (
              <Line
                type="monotone"
                dataKey="spendingMinor"
                stroke={SERIES}
                strokeWidth={2}
                dot={{ r: 4, fill: SERIES, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
