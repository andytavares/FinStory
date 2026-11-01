import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { moneyCompact, money } from '../lib/format';
import { BarGradients } from './BarGradients';
import {
  BAR_HORIZONTAL_GRADIENT_ID,
  GRID_STROKE,
  LABEL_TICK,
  TOOLTIP_CURSOR,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
  VALUE_TICK,
} from './theme';

/**
 * Spending by category.
 *
 * One series — magnitude by category — so a single hue is correct and no legend
 * is needed; the title names it. Bars are sorted largest first, which already
 * answers "where did most of it go".
 */

export interface CategoryDatum {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly totalMinor: number;
}

export interface PlottedRow extends CategoryDatum {
  readonly magnitude: number;
}

/**
 * Sort by size and fold everything past the cut into "Other".
 *
 * Exported so the aggregation is testable directly: Recharts renders axis
 * labels inside an SVG that has no layout in jsdom, so asserting on the chart
 * output would test nothing.
 */
export function foldOverflow(data: readonly CategoryDatum[], max: number): PlottedRow[] {
  const rows = [...data]
    .map((d) => ({ ...d, magnitude: Math.abs(d.totalMinor) }))
    .sort((a, b) => b.magnitude - a.magnitude);

  const shown = rows.slice(0, max);
  const rest = rows.slice(max);
  if (rest.length === 0) return shown;

  // Never silently truncate: the remainder is aggregated and counted.
  return [
    ...shown,
    {
      categoryId: '__other__',
      categoryName: `Other (${rest.length})`,
      totalMinor: rest.reduce((a, r) => a + r.totalMinor, 0),
      magnitude: rest.reduce((a, r) => a + r.magnitude, 0),
    },
  ];
}

export function CategoryBars({
  data,
  title,
  max = 12,
  onSelect,
}: {
  data: readonly CategoryDatum[];
  title: string;
  max?: number;
  /** Clicking a bar drills into that category. */
  onSelect?: (categoryId: string) => void;
}): React.JSX.Element {
  if (data.length === 0) {
    return (
      <p className="rounded-[12px] border border-dashed border-[var(--color-line)] px-4 py-8 text-center text-[13px] text-[var(--color-ink-faint)]">
        Nothing to chart for this period.
      </p>
    );
  }

  const plotted = foldOverflow(data, max);

  const height = Math.max(180, plotted.length * 28 + 40);

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex items-center justify-between text-[13px] font-semibold">
        <span>{title}</span>
        {onSelect && (
          <span className="text-[12px] font-normal text-[var(--color-ink-faint)]">
            Click a bar to see its transactions
          </span>
        )}
      </figcaption>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={plotted}
            layout="vertical"
            margin={{ top: 4, right: 56, bottom: 4, left: 0 }}
            onClick={(state) => {
              const index = Number(state.activeTooltipIndex ?? -1);
              const row = plotted[index];
              // "Other" is an aggregate with no single category to open.
              if (row && row.categoryId !== '__other__') onSelect?.(row.categoryId);
            }}
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
          >
            <BarGradients />
            <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
            <XAxis
              type="number"
              tick={VALUE_TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => moneyCompact(v)}
            />
            <YAxis
              type="category"
              dataKey="categoryName"
              tick={LABEL_TICK}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
              width={150}
            />
            <Tooltip
              cursor={TOOLTIP_CURSOR}
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              formatter={(v) => [money(Number(v)), 'Spent']}
            />
            <Bar
              dataKey="magnitude"
              fill={`url(#${BAR_HORIZONTAL_GRADIENT_ID})`}
              radius={[0, 5, 5, 0]}
              maxBarSize={18}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
