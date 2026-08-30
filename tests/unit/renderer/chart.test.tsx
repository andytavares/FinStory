// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SpendingOverTime } from '@renderer/charts/SpendingOverTime';

afterEach(cleanup);

describe('SpendingOverTime (FR-065)', () => {
  const data = [
    { label: 'Jun', spendingMinor: 412000 },
    { label: 'Jul', spendingMinor: 389000 },
    { label: 'Aug', spendingMinor: 425000 },
  ];

  it('names the series in the title, so a single series needs no legend', () => {
    render(<SpendingOverTime data={data} priorAverageMinor={400000} title="Spending by month" />);
    expect(screen.getByText('Spending by month')).toBeDefined();
  });

  it('renders as a figure with a caption', () => {
    const { container } = render(
      <SpendingOverTime data={data} priorAverageMinor={null} title="Spending by month" />,
    );
    expect(container.querySelector('figure')).not.toBeNull();
    expect(container.querySelector('figcaption')).not.toBeNull();
  });

  it('says so plainly when there is not enough history to chart', () => {
    render(<SpendingOverTime data={[]} priorAverageMinor={null} title="Spending by month" />);
    expect(screen.getByText(/Not enough history yet to chart/)).toBeDefined();
  });

  it('omits the reference line when no baseline exists', () => {
    const { container } = render(
      <SpendingOverTime data={data} priorAverageMinor={null} title="Spending" />,
    );
    expect(container.textContent).not.toContain('your average');
  });
});
