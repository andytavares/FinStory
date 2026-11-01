// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CategoryBars, foldOverflow } from '@renderer/charts/CategoryBars';
import { SpendingOverTime } from '@renderer/charts/SpendingOverTime';

afterEach(cleanup);

const DATA = [
  { categoryId: 'food', categoryName: 'Food', totalMinor: -102_000 },
  { categoryId: 'housing', categoryName: 'Housing', totalMinor: -120_000 },
  { categoryId: 'travel', categoryName: 'Travel', totalMinor: -20_000 },
];

describe('CategoryBars', () => {
  it('renders as a titled figure', () => {
    const { container } = render(<CategoryBars data={DATA} title="Where it went" />);
    expect(screen.getByText('Where it went')).toBeDefined();
    expect(container.querySelector('figure')).not.toBeNull();
  });

  it('says so plainly when there is nothing to chart', () => {
    render(<CategoryBars data={[]} title="Where it went" />);
    expect(screen.getByText(/Nothing to chart for this period/)).toBeDefined();
  });

  it('invites interaction only when a click handler exists', () => {
    const { rerender } = render(<CategoryBars data={DATA} title="t" />);
    expect(screen.queryByText(/Click a bar/)).toBeNull();
    rerender(<CategoryBars data={DATA} title="t" onSelect={() => {}} />);
    expect(screen.getByText(/Click a bar to see its transactions/)).toBeDefined();
  });

  it('folds overflow into a labelled Other rather than dropping it', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      categoryId: `c${i}`,
      categoryName: `Cat ${i}`,
      totalMinor: -(1000 * (15 - i)),
    }));
    const plotted = foldOverflow(many, 5);
    expect(plotted).toHaveLength(6);
    expect(plotted.at(-1)?.categoryName).toBe('Other (10)');
  });

  it('never loses money when folding — Other carries the remainder', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      categoryId: `c${i}`,
      categoryName: `Cat ${i}`,
      totalMinor: -(1000 * (15 - i)),
    }));
    const total = many.reduce((a, r) => a + r.totalMinor, 0);
    expect(foldOverflow(many, 5).reduce((a, r) => a + r.totalMinor, 0)).toBe(total);
  });

  it('does not add an Other bucket when everything fits', () => {
    expect(foldOverflow(DATA, 10).some((r) => r.categoryId === '__other__')).toBe(false);
  });

  it('sorts largest first', () => {
    expect(foldOverflow(DATA, 10).map((r) => r.categoryId)).toEqual(['housing', 'food', 'travel']);
  });
});

describe('SpendingOverTime', () => {
  const SERIES = [
    { label: '2026-06', spendingMinor: 412_000 },
    { label: '2026-07', spendingMinor: 389_000 },
    { label: '2026-08', spendingMinor: 425_000 },
  ];

  it('offers a bars/line toggle', () => {
    render(<SpendingOverTime data={SERIES} priorAverageMinor={400_000} title="Spending" />);
    expect(screen.getByRole('button', { name: 'Bars' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Line' })).toBeDefined();
  });

  it('hides the bars/line toggle when asked', () => {
    render(<SpendingOverTime data={SERIES} priorAverageMinor={null} title="Spending" showShapeToggle={false} />);
    expect(screen.queryByRole('button', { name: 'Bars' })).toBeNull();
  });

  it('starts on bars and reports the pressed state', () => {
    render(<SpendingOverTime data={SERIES} priorAverageMinor={null} title="Spending" />);
    expect(screen.getByRole('button', { name: 'Bars' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('switches to the line shape', () => {
    render(<SpendingOverTime data={SERIES} priorAverageMinor={null} title="Spending" />);
    fireEvent.click(screen.getByRole('button', { name: 'Line' }));
    expect(screen.getByRole('button', { name: 'Line' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Bars' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('invites period selection only when a handler exists', () => {
    const { rerender } = render(
      <SpendingOverTime data={SERIES} priorAverageMinor={null} title="Spending" />,
    );
    expect(screen.queryByText(/Click a period/)).toBeNull();
    rerender(
      <SpendingOverTime
        data={SERIES}
        priorAverageMinor={null}
        title="Spending"
        onSelectPeriod={() => {}}
      />,
    );
    expect(screen.getByText(/Click a period to open it/)).toBeDefined();
  });

  it('says so plainly when there is not enough history', () => {
    render(<SpendingOverTime data={[]} priorAverageMinor={null} title="Spending" />);
    expect(screen.getByText(/Not enough history yet to chart/)).toBeDefined();
  });
});

describe('fold edge cases', () => {
  it('handles an empty set', () => {
    expect(foldOverflow([], 5)).toEqual([]);
  });

  it('handles exactly the cut with no Other bucket', () => {
    const five = Array.from({ length: 5 }, (_, i) => ({
      categoryId: `c${i}`,
      categoryName: `C${i}`,
      totalMinor: -1000,
    }));
    expect(foldOverflow(five, 5)).toHaveLength(5);
  });

  it('folds a single overflow row', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      categoryId: `c${i}`,
      categoryName: `C${i}`,
      totalMinor: -(1000 - i),
    }));
    expect(foldOverflow(six, 5).at(-1)?.categoryName).toBe('Other (1)');
  });

  it('sorts by magnitude, so income and spending rank by size not sign', () => {
    const mixed = [
      { categoryId: 'in', categoryName: 'Income', totalMinor: 500_000 },
      { categoryId: 'out', categoryName: 'Rent', totalMinor: -120_000 },
    ];
    expect(foldOverflow(mixed, 10).map((r) => r.categoryId)).toEqual(['in', 'out']);
  });
});
