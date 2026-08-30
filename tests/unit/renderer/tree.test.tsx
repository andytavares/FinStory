// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CategoryTree, groupByParent } from '@renderer/components/CategoryTree';
import type { BreakdownRow } from '@renderer/components/CategoryTree';

afterEach(cleanup);

const row = (o: Partial<BreakdownRow>): BreakdownRow => ({
  categoryId: 'x',
  name: 'X',
  parentId: null,
  parentName: null,
  totalMinor: -1000,
  txCount: 1,
  ...o,
});

const ROWS: BreakdownRow[] = [
  row({ categoryId: 'dining', name: 'Dining', parentId: 'food', parentName: 'Food', totalMinor: -64_000, txCount: 14 }),
  row({ categoryId: 'groceries', name: 'Groceries', parentId: 'food', parentName: 'Food', totalMinor: -38_000, txCount: 9 }),
  row({ categoryId: 'rent', name: 'Rent', parentId: 'housing', parentName: 'Housing', totalMinor: -120_000, txCount: 1 }),
  row({ categoryId: 'travel', name: 'Travel', totalMinor: -20_000, txCount: 2 }),
];

describe('rolling a breakdown up to parents', () => {
  it('sums children into their parent', () => {
    const groups = groupByParent(ROWS);
    const food = groups.find((g) => g.id === 'food');
    expect(food?.totalMinor).toBe(-102_000);
    expect(food?.txCount).toBe(23);
    expect(food?.children).toHaveLength(2);
  });

  it('keeps a top-level category as its own group', () => {
    expect(groupByParent(ROWS).find((g) => g.id === 'travel')?.children).toHaveLength(0);
  });

  it('preserves the grand total — grouping must not lose money', () => {
    const total = ROWS.reduce((a, r) => a + r.totalMinor, 0);
    expect(groupByParent(ROWS).reduce((a, g) => a + g.totalMinor, 0)).toBe(total);
  });

  it('orders groups by size, largest spend first', () => {
    expect(groupByParent(ROWS).map((g) => g.id)).toEqual(['housing', 'food', 'travel']);
  });

  it('tracks spending recorded on the parent itself', () => {
    const withOwn = [...ROWS, row({ categoryId: 'food', name: 'Food', totalMinor: -5_000 })];
    const food = groupByParent(withOwn).find((g) => g.id === 'food');
    expect(food?.ownMinor).toBe(-5_000);
    expect(food?.totalMinor).toBe(-107_000);
  });

  it('does not drop a row whose parent is unknown', () => {
    const orphan = [row({ categoryId: 'ghost', name: 'Ghost', parentId: 'gone', parentName: null, totalMinor: -900 })];
    const groups = groupByParent(orphan);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.totalMinor).toBe(-900);
  });
});

describe('CategoryTree interaction', () => {
  it('shows parents collapsed by default', () => {
    render(<CategoryTree rows={ROWS} onDrill={() => {}} />);
    expect(screen.getByText('Food')).toBeDefined();
    expect(screen.queryByText('Dining')).toBeNull();
  });

  it('expands a parent to reveal its subcategories', () => {
    render(<CategoryTree rows={ROWS} onDrill={() => {}} />);
    fireEvent.click(screen.getByLabelText('Expand Food'));
    expect(screen.getByText('Dining')).toBeDefined();
    expect(screen.getByText('Groceries')).toBeDefined();
  });

  it('collapses again', () => {
    render(<CategoryTree rows={ROWS} onDrill={() => {}} />);
    fireEvent.click(screen.getByLabelText('Expand Food'));
    fireEvent.click(screen.getByLabelText('Expand Food'));
    expect(screen.queryByText('Dining')).toBeNull();
  });

  it('reports expansion state to assistive technology', () => {
    render(<CategoryTree rows={ROWS} onDrill={() => {}} />);
    const button = screen.getByLabelText('Expand Food');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(screen.getByLabelText('Expand Food').getAttribute('aria-expanded')).toBe('true');
  });

  it('drills straight through for a category with no children', () => {
    let drilled: string | null = null;
    render(<CategoryTree rows={ROWS} onDrill={(id) => (drilled = id)} />);
    fireEvent.click(screen.getByLabelText('View Travel'));
    expect(drilled).toBe('travel');
  });

  it('drills into spending recorded directly on the parent', () => {
    const withOwn = [
      ...ROWS,
      row({ categoryId: 'food', name: 'Food', totalMinor: -41_387, txCount: 3 }),
    ];
    let drilled: string | null = null;
    render(<CategoryTree rows={withOwn} onDrill={(id) => (drilled = id)} />);
    fireEvent.click(screen.getByLabelText('Expand Food'));
    fireEvent.click(screen.getByLabelText('View transactions directly in Food'));
    expect(drilled).toBe('food');
  });

  it('omits the direct row when nothing sits on the parent itself', () => {
    render(<CategoryTree rows={ROWS} onDrill={() => {}} />);
    fireEvent.click(screen.getByLabelText('Expand Food'));
    expect(screen.queryByLabelText(/View transactions directly in/)).toBeNull();
  });

  it('drills into a subcategory once expanded', () => {
    let drilled: string | null = null;
    render(<CategoryTree rows={ROWS} onDrill={(id) => (drilled = id)} />);
    fireEvent.click(screen.getByLabelText('Expand Food'));
    fireEvent.click(screen.getByText('Dining'));
    expect(drilled).toBe('dining');
  });
});

describe('the "Directly in" row', () => {
  const row = (over: Partial<BreakdownRow> = {}): BreakdownRow => ({
    categoryId: 'food',
    name: 'Food',
    parentId: null,
    parentName: null,
    totalMinor: -1000,
    txCount: 2,
    ...over,
  });

  it('appears when transactions sit on the parent itself', () => {
    render(
      <CategoryTree
        rows={[row(), row({ categoryId: 'dining', name: 'Dining', parentId: 'food', parentName: 'Food' })]}
        onDrill={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('Expand Food'));
    expect(screen.getByText('Directly in Food')).toBeDefined();
  });

  it('appears even when those transactions net to zero', () => {
    // A refund cancelling its original still leaves two real transactions.
    render(
      <CategoryTree
        rows={[
          row({ totalMinor: 0, txCount: 2 }),
          row({ categoryId: 'dining', name: 'Dining', parentId: 'food', parentName: 'Food' }),
        ]}
        onDrill={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('Expand Food'));
    expect(screen.getByText('Directly in Food')).toBeDefined();
  });

  it('appears when the only transactions on the parent were not counted', () => {
    render(
      <CategoryTree
        rows={[
          row({ totalMinor: 0, txCount: 5, countedCount: 0 }),
          row({ categoryId: 'dining', name: 'Dining', parentId: 'food', parentName: 'Food' }),
        ]}
        onDrill={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('Expand Food'));
    expect(screen.getByText('Directly in Food')).toBeDefined();
  });

  it('stays hidden when nothing sits on the parent', () => {
    render(
      <CategoryTree
        rows={[row({ categoryId: 'dining', name: 'Dining', parentId: 'food', parentName: 'Food' })]}
        onDrill={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('Expand Food'));
    expect(screen.queryByText('Directly in Food')).toBeNull();
  });

  it('drills into the parent category', () => {
    const onDrill = vi.fn();
    render(
      <CategoryTree
        rows={[row(), row({ categoryId: 'dining', name: 'Dining', parentId: 'food', parentName: 'Food' })]}
        onDrill={onDrill}
      />,
    );
    fireEvent.click(screen.getByLabelText('Expand Food'));
    fireEvent.click(screen.getByLabelText('View transactions directly in Food'));
    expect(onDrill).toHaveBeenCalledWith('food');
  });

  it('counts every transaction, and says how many built the amount', () => {
    render(
      <CategoryTree
        rows={[
          row({ txCount: 8, countedCount: 3 }),
          row({ categoryId: 'dining', name: 'Dining', parentId: 'food', parentName: 'Food' }),
        ]}
        onDrill={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('Expand Food'));
    const label = screen.getByLabelText('View transactions directly in Food');
    expect(label.textContent).toContain('8');
    expect(label.querySelector('[title*="3 counted in this amount"]')).not.toBeNull();
  });
})
