// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Sparkline } from '@renderer/charts/Sparkline';
import { CategoryDonut } from '@renderer/charts/CategoryDonut';
import { RunwayChart } from '@renderer/charts/RunwayChart';
import { SpendingOverTime } from '@renderer/charts/SpendingOverTime';
import { IncomeVsSpending } from '@renderer/charts/IncomeVsSpending';
import { SyncHistory } from '@renderer/charts/SyncHistory';

afterEach(cleanup);

describe('chart kit', () => {
  it('renders a sparkline from a series', () => {
    const { container } = render(<Sparkline values={[1, 3, 2, 5]} color="#6d8bff" />);
    expect(container.querySelector('.recharts-responsive-container, svg')).not.toBeNull();
  });

  it('lists each donut slice with its amount', () => {
    render(
      <CategoryDonut
        parts={[
          { name: 'Housing', value: 180000 },
          { name: 'Food', value: 61240 },
        ]}
        legend
      />,
    );
    expect(screen.getByText('Housing')).toBeDefined();
    expect(screen.getByText('$1,800.00')).toBeDefined();
    expect(screen.getByText('Food')).toBeDefined();
  });

  it('renders the runway chart with its floor label', () => {
    const { container } = render(
      <RunwayChart
        points={[
          { date: '2026-11-01', balance: 236700 },
          { date: '2026-11-12', balance: 141600 },
        ]}
        floor={100000}
        label="$1,416 on payday"
      />,
    );
    expect(container.firstChild).not.toBeNull();
    // Drawn as text outside the plot so it cannot sit on the line or the axis.
    expect(screen.getByText('$1,416 on payday')).toBeDefined();
  });

  it('names the spending average outside the plot so it cannot cover a bar', () => {
    render(
      <SpendingOverTime
        data={[{ label: '2026-10', spendingMinor: 1_000_000 }]}
        priorAverageMinor={1_642_035}
        title="Spending by month"
      />,
    );
    expect(screen.getByText('avg $16,420.35')).toBeDefined();
  });

  it('renders income vs spending', () => {
    const { container } = render(
      <IncomeVsSpending data={[{ label: 'Jun', income: 6200, spending: 1890 }]} />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it('draws one bar per sync run, red for failures', () => {
    render(
      <SyncHistory
        runs={[
          { ok: true, value: 8 },
          { ok: false, value: 0 },
          { ok: true, value: 10 },
        ]}
      />,
    );
    const bars = screen.getAllByRole('img');
    expect(bars).toHaveLength(3);
    expect(bars[1]?.getAttribute('aria-label')).toBe('Failed');
    expect(bars[0]?.getAttribute('aria-label')).toBe('Succeeded');
  });

  it('scales successful bars to the largest value, and gives equal bars when sizes are unknown', () => {
    const heights = (runs: Array<{ ok: boolean; value: number }>): string[] => {
      const { unmount } = render(<SyncHistory runs={runs} />);
      const found = screen.getAllByRole('img').map((bar) => (bar as HTMLElement).style.height);
      unmount();
      return found;
    };
    expect(heights([{ ok: true, value: 200 }, { ok: true, value: 400 }, { ok: false, value: 0 }])).toEqual(['35px', '70px', '70px']);
    expect(heights([{ ok: true, value: 0 }, { ok: true, value: 0 }])).toEqual(['63px', '63px']);
  });
});
