// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { installMoneyBridge } from './setup';
import { vi } from 'vitest';
import { useState } from 'react';
import { Reports } from '@renderer/views/Reports';
import { ReportDetail } from '@renderer/views/ReportDetail';

afterEach(cleanup);

/** A bridge whose `invoke` can be asserted on. */
function bridgeSpy(responses: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const invoke = vi.fn((channel: string) => Promise.resolve(responses[channel] ?? { ok: true }));
  installMoneyBridge({});
  Object.defineProperty(globalThis.window, 'money', { configurable: true, value: { invoke, on: () => () => {} } });
  return invoke;
}

const SUMMARY = {
  id: 'rep1',
  type: 'monthly_report' as const,
  label: null,
  periodStart: '2026-08-01T00:00:00Z',
  periodEnd: '2026-09-01T00:00:00Z',
  dataComplete: true,
  wasLate: false,
  totalSpendingMinor: -425_000,
  savingsRate: 0.18,
  headline: 'You spent $4,250, 12% above your average',
  summary: 'Rent was 41% of it. Netflix went up $3 in June.',
  series: [100, 200, 150],
};

const MONTHLY = {
  id: 'rep1',
  type: 'monthly_report' as const,
  periodStart: '2026-08-01T00:00:00Z',
  periodEnd: '2026-09-01T00:00:00Z',
  dataComplete: true,
  wasLate: false,
  kpiSeries: [
    { periodStart: '2026-07-01T00:00:00Z', totalIncomeMinor: 500_000, totalSpendingMinor: -380_000, savingsMinor: 120_000, savingsRate: 0.24 },
    { periodStart: '2026-08-01T00:00:00Z', totalIncomeMinor: 520_000, totalSpendingMinor: -425_000, savingsMinor: 95_000, savingsRate: 0.18 },
  ],
  content: {
    totalIncomeMinor: 520_000,
    totalSpendingMinor: -425_000,
    savingsMinor: 95_000,
    savingsRate: 0.18,
    categoryComparisons: [
      { categoryId: 'dining', categoryName: 'Dining & Takeout', currentMinor: -64_000, priorMinor: -50_000, changeMinor: -14_000, direction: 'up' as const },
      { categoryId: 'rent', categoryName: 'Rent & Mortgage', currentMinor: -120_000, priorMinor: -120_000, changeMinor: 0, direction: 'flat' as const },
    ],
    largestPurchases: [{ id: 'a', amountMinor: -120_000, categoryId: 'rent', categoryName: 'Rent & Mortgage', merchantName: 'Landlord', postedDate: '2026-08-01' }],
    recurringAudit: [
      { merchantKey: 'netflix', merchantName: 'Netflix', currentAmountMinor: -1_599, cadence: 'monthly', cumulativePaidMinor: -12_792 },
    ],
    projectedAnnualSpendingMinor: -5_100_000,
    projectionAssumption: 'Assumes current spending patterns continue unchanged.',
    qualification: null,
  },
};

/** Reports is route-driven now; the shell owns which report is open. */
function ReportsHarness(): React.JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Reports
      openReportId={openId}
      onOpenReport={setOpenId}
      onCloseReport={() => setOpenId(null)}
    />
  );
}

describe('Reports list', () => {
  beforeEach(() =>
    installMoneyBridge({
      'reports:list': [SUMMARY],
      'reports:generate': { id: 'rep2' },
      'reports:delete': { ok: true },
      'reports:get': MONTHLY,
    }),
  );

  it('offers scheduled runs and a custom range', async () => {
    render(<ReportsHarness />);
    const month = new Date().toLocaleDateString('en-US', { month: 'long' });
    await waitFor(() => screen.getByRole('button', { name: `Run ${month} report` }));
    expect(screen.getByRole('button', { name: 'Run weekly digest' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Custom range…' })).toBeDefined();
  });

  it('reveals date inputs for a custom report', async () => {
    render(<ReportsHarness />);
    await waitFor(() => screen.getByRole('button', { name: 'Custom range…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Custom range…' }));
    expect(screen.getByLabelText('Report start date')).toBeDefined();
    expect(screen.getByLabelText('Report end date')).toBeDefined();
    expect(screen.getByLabelText('Report name')).toBeDefined();
  });

  it('keeps Generate disabled until both dates are set', async () => {
    render(<ReportsHarness />);
    await waitFor(() => screen.getByRole('button', { name: 'Custom range…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Custom range…' }));
    const generate = screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement;
    expect(generate.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Report start date'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('Report end date'), { target: { value: '2026-08-10' } });
    expect((screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the latest report as a headline with its period', async () => {
    render(<ReportsHarness />);
    await waitFor(() => expect(screen.getByText('You spent $4,250, 12% above your average')).toBeDefined());
    expect(screen.getByText('Latest · August 2026')).toBeDefined();
    expect(screen.getByText('Rent was 41% of it. Netflix went up $3 in June.')).toBeDefined();
  });

  it('opens the latest report', async () => {
    render(<ReportsHarness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open report' }));
    await waitFor(() => expect(screen.getByText('← All reports')).toBeDefined());
  });

  it('opens the report and exports it to PDF from the list', async () => {
    const invoke = bridgeSpy({ 'reports:list': [SUMMARY], 'reports:get': MONTHLY, 'reports:exportPdf': { ok: true, path: '/tmp/a.pdf' } });
    render(<ReportsHarness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Export PDF' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('reports:exportPdf', { id: 'rep1' }), { timeout: 2000 });
    expect(screen.getByText('← All reports')).toBeDefined();
  });

  it('lists older reports as cards with open and delete', async () => {
    const invoke = bridgeSpy({
      'reports:list': [SUMMARY, { ...SUMMARY, id: 'rep0', periodStart: '2026-07-01T00:00:00Z', periodEnd: '2026-08-01T00:00:00Z' }],
      'reports:delete': { ok: true },
    });
    render(<ReportsHarness />);
    expect(await screen.findByText('July report')).toBeDefined();
    fireEvent.click(screen.getByLabelText('Delete report from 2026-07-01'));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('reports:delete', { id: 'rep0' }));
  });

  it('shows a custom report by its name rather than its month', async () => {
    installMoneyBridge({
      'reports:list': [SUMMARY, { ...SUMMARY, id: 'rep9', type: 'custom' as const, label: 'Trip to Japan' }],
    });
    render(<ReportsHarness />);
    expect(await screen.findByText('Trip to Japan')).toBeDefined();
    expect(screen.getByText(/Custom range · /)).toBeDefined();
  });
});

describe('Report detail', () => {
  beforeEach(() => installMoneyBridge({ 'reports:get': MONTHLY }));

  it('deletes the report and tells the caller', async () => {
    const invoke = vi.fn((channel: string) =>
      Promise.resolve(channel === 'reports:get' ? MONTHLY : { ok: true }),
    );
    Object.defineProperty(globalThis.window, 'money', {
      configurable: true,
      value: { invoke, on: () => () => {} },
    });
    const onDeleted = vi.fn();
    render(<ReportDetail reportId="rep1" actions={{ onBack: () => {}, onDeleted: onDeleted }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete report' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith('reports:delete', { id: 'rep1' });
  });

  it('shows the headline figures', async () => {
    render(<ReportDetail reportId="rep1" actions={{ onBack: () => {}, onDeleted: () => {} }} />);
    await waitFor(() => expect(screen.getByText('18%')).toBeDefined());
    expect(screen.getByText('Saved')).toBeDefined();
  });

  it('shows the change with its unit, not a bare number', async () => {
    render(<ReportDetail reportId="rep1" actions={{ onBack: () => {}, onDeleted: () => {} }} />);
    // Groups are collapsed by default; open the one holding dining.
    await waitFor(() => screen.getAllByRole('button'));
    for (const b of screen.getAllByRole('button')) {
      if (b.getAttribute('aria-expanded') === 'false') fireEvent.click(b);
    }
    await waitFor(() => expect(screen.getByText(/↑ \$140\.00/)).toBeDefined());
    expect(screen.getByText('same')).toBeDefined();
  });

  it('groups the comparison by parent and hides children until expanded', async () => {
    installMoneyBridge({
      'reports:get': {
        ...MONTHLY,
        content: {
          ...MONTHLY.content,
          categoryComparisons: [
            { categoryId: 'dining', categoryName: 'Dining', parentId: 'food', parentName: 'Food', currentMinor: -64_000, priorMinor: -50_000, changeMinor: -14_000, direction: 'up' as const },
            { categoryId: 'groceries', categoryName: 'Groceries', parentId: 'food', parentName: 'Food', currentMinor: -38_000, priorMinor: -30_000, changeMinor: -8_000, direction: 'up' as const },
          ],
        },
      },
    });
    render(<ReportDetail reportId="rep1" actions={{ onBack: () => {}, onDeleted: () => {} }} />);
    await waitFor(() => expect(screen.getAllByText('Food').length).toBeGreaterThan(0));
    // Children hidden until expanded; the parent still reports the rolled-up
    // change so a collapsed group is not silent.
    expect(screen.queryByText('Dining')).toBeNull();
    expect(screen.getByText(/↑ \$220\.00/)).toBeDefined();

    fireEvent.click(screen.getByLabelText('Expand Food'));
    expect(screen.getByText('Dining')).toBeDefined();
    expect(screen.getByText(/↑ \$140\.00/)).toBeDefined();
  });

  it('shows human category names, never raw ids', async () => {
    render(<ReportDetail reportId="rep1" actions={{ onBack: () => {}, onDeleted: () => {} }} />);
    await waitFor(() => expect(screen.getAllByText('Dining & Takeout').length).toBeGreaterThan(0));
    expect(screen.queryByText(/^cat_/)).toBeNull();
  });

  it('renders a chart of the category breakdown', async () => {
    const { container } = render(<ReportDetail reportId="rep1" actions={{ onBack: () => {}, onDeleted: () => {} }} />);
    await waitFor(() => expect(screen.getByText('Where it went')).toBeDefined());
    expect(container.querySelector('.recharts-pie, svg')).not.toBeNull();
  });

  it('includes the recurring audit and largest purchases', async () => {
    render(<ReportDetail reportId="rep1" actions={{ onBack: () => {}, onDeleted: () => {} }} />);
    await waitFor(() => expect(screen.getByText('Netflix')).toBeDefined());
    expect(screen.getByText('Largest purchases')).toBeDefined();
    expect(screen.getByText('Landlord')).toBeDefined();
  });

  it('shows the in and out tiles with signs and the previous month', async () => {
    render(<ReportDetail reportId="rep1" actions={{ onBack: () => {}, onDeleted: () => {} }} />);
    await waitFor(() => expect(screen.getByText('+$5,200.00')).toBeDefined());
    expect(screen.getByText('Versus July')).toBeDefined();
    expect(screen.getByText('was 24% in Jul')).toBeDefined();
  });

  it('exports the open report to PDF', async () => {
    const invoke = bridgeSpy({ 'reports:get': MONTHLY, 'reports:exportPdf': { ok: true, path: '/tmp/a.pdf' } });
    render(<ReportDetail reportId="rep1" actions={{ onBack: () => {}, onDeleted: () => {} }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Export PDF' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('reports:exportPdf', { id: 'rep1' }));
    expect(await screen.findByText('Saved to /tmp/a.pdf')).toBeDefined();
  });

  it('states the assumption behind the annual projection (FR-041)', async () => {
    render(<ReportDetail reportId="rep1" actions={{ onBack: () => {}, onDeleted: () => {} }} />);
    await waitFor(() =>
      expect(screen.getByText(/Assumes current spending patterns continue/)).toBeDefined(),
    );
  });

  it('goes back to the list', async () => {
    let backed = false;
    render(<ReportDetail reportId="rep1" actions={{ onBack: () => (backed = true), onDeleted: () => {} }} />);
    await waitFor(() => screen.getByText('← All reports'));
    fireEvent.click(screen.getByText('← All reports'));
    expect(backed).toBe(true);
  });

  it('reports an empty digest period honestly', async () => {
    installMoneyBridge({
      'reports:get': {
        ...MONTHLY,
        type: 'weekly_digest',
        content: { hadActivity: false, categoryTotals: [], deviations: [], qualification: null },
      },
    });
    render(<ReportDetail reportId="rep1" actions={{ onBack: () => {}, onDeleted: () => {} }} />);
    await waitFor(() => expect(screen.getByText(/No activity in this period/)).toBeDefined());
  });

  it('makes no comparison claims when there are none to make (FR-040)', async () => {
    installMoneyBridge({
      'reports:get': {
        ...MONTHLY,
        type: 'weekly_digest',
        content: {
          hadActivity: true,
          categoryTotals: [{ categoryId: 'dining', categoryName: 'Dining & Takeout', totalMinor: -6400 }],
          deviations: [
            { categoryId: 'dining', categoryName: 'Dining & Takeout', hasClaim: false, direction: null, multiple: null, actualMinor: -6400 },
          ],
          qualification: null,
        },
      },
    });
    render(<ReportDetail reportId="rep1" actions={{ onBack: () => {}, onDeleted: () => {} }} />);
    await waitFor(() =>
      expect(screen.getByText(/a few more weeks of history are needed/)).toBeDefined(),
    );
    expect(screen.queryByText('Worth noticing')).toBeNull();
  });

  it('surfaces a deviation once one is warranted', async () => {
    installMoneyBridge({
      'reports:get': {
        ...MONTHLY,
        type: 'weekly_digest',
        content: {
          hadActivity: true,
          categoryTotals: [{ categoryId: 'dining', categoryName: 'Dining & Takeout', totalMinor: -31_000 }],
          deviations: [
            { categoryId: 'dining', categoryName: 'Dining & Takeout', hasClaim: true, direction: 'above', multiple: 3.06, actualMinor: -31_000 },
          ],
          qualification: null,
        },
      },
    });
    render(<ReportDetail reportId="rep1" actions={{ onBack: () => {}, onDeleted: () => {} }} />);
    await waitFor(() => expect(screen.getByText('Worth noticing')).toBeDefined());
    expect(screen.getByText(/3\.1× above your normal range/)).toBeDefined();
  });

  it('handles a missing report without crashing', async () => {
    installMoneyBridge({});
    render(<ReportDetail reportId="nope" actions={{ onBack: () => {}, onDeleted: () => {} }} />);
    await waitFor(() => expect(screen.getByText('← All reports')).toBeDefined());
  });
});
