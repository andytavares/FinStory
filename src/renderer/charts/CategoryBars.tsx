import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { moneyCompact, money } from '../lib/format';

/**
 * Spending by category.
 *
 * One series — magnitude by category — so a single hue is correct and no legend
 * is needed; the title names it. #4897cd was validated against this app's dark
 * surface (#161e26) with the dataviz validator: passes lightness band, chroma
 * floor, and 3:1 contrast. Do not adjust it by eye.
 *
 * Bars are sorted largest first, which already answers "where did most of it
 * go" — a second colour for emphasis would encode a distinction the data does
 * not contain, and the muted variant failed the palette validator's chroma
 * floor anyway.
 */

const SERIES = '#4897cd';
const INK_FAINT = 'oklch(0.56 0.02 250)';
const LINE = 'oklch(0.34 0.02 250)';

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
      <p className="border border-dashed border-[var(--color-line)] px-4 py-8 text-center text-[13px] text-[var(--color-ink-faint)]">
        Nothing to chart for this period.
      </p>
    );
  }

  const plotted = foldOverflow(data, max);

  const height = Math.max(180, plotted.length * 28 + 40);

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex items-baseline justify-between text-[15px]">
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
            <CartesianGrid stroke={LINE} horizontal={false} />
            <XAxis
              type="number"
              stroke={INK_FAINT}
              tickLine={false}
              axisLine={false}
              fontSize={11}
              tickFormatter={(v: number) => moneyCompact(v)}
            />
            <YAxis
              type="category"
              dataKey="categoryName"
              stroke={INK_FAINT}
              tickLine={false}
              axisLine={{ stroke: LINE }}
              fontSize={11}
              width={150}
            />
            <Tooltip
              cursor={{ fill: 'oklch(0.27 0.02 250)' }}
              contentStyle={{
                background: 'oklch(0.23 0.02 250)',
                border: `1px solid ${LINE}`,
                borderRadius: 0,
                fontSize: 12,
              }}
              labelStyle={{ color: INK_FAINT }}
              formatter={(v) => [money(Number(v)), 'Spent']}
            />
            <Bar dataKey="magnitude" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
