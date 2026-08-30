// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { installMoneyBridge } from './setup';
import { useState } from 'react';
import { Reports } from '@renderer/views/Reports';
import { ReportDetail } from '@renderer/views/ReportDetail';

afterEach(cleanup);

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
};

const MONTHLY = {
  id: 'rep1',
  type: 'monthly_report' as const,
  periodStart: '2026-08-01T00:00:00Z',
  periodEnd: '2026-09-01T00:00:00Z',
  dataComplete: true,
  wasLate: false,
  content: {
    totalIncomeMinor: 520_000,
    totalSpendingMinor: -425_000,
    savingsMinor: 95_000,
    savingsRate: 0.18,
    categoryComparisons: [
      { categoryId: 'dining', categoryName: 'Dining & Takeout', currentMinor: -64_000, priorMinor: -50_000, changeMinor: -14_000, direction: 'up' as const },
      { categoryId: 'rent', categoryName: 'Rent & Mortgage', currentMinor: -120_000, priorMinor: -120_000, changeMinor: 0, direction: 'flat' as const },
    ],
    largestPurchases: [{ id: 'a', amountMinor: -120_000, categoryId: 'rent', categoryName: 'Rent & Mortgage' }],
    recurringAudit: [
      { merchantKey: 'netflix', currentAmountMinor: -1_599, cadence: 'monthly', cumulativePaidMinor: -12_792 },
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
    await waitFor(() => screen.getByRole('button', { name: 'Run monthly report' }));
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

  it('opens a report when its row is clicked', async () => {
    render(<ReportsHarness />);
    await waitFor(() => screen.getByText(/August 2026/));
    fireEvent.click(screen.getByText(/August 2026/));
    await waitFor(() => expect(screen.getByText('← All reports')).toBeDefined());
  });

  it('offers deletion per report', async () => {
    render(<ReportsHarness />);
    await waitFor(() => expect(screen.getByLabelText(/Delete report from 2026-08-01/)).toBeDefined());
  });

  it('shows a custom report by its name rather than its month', async () => {
    installMoneyBridge({
      'reports:list': [{ ...SUMMARY, type: 'custom' as const, label: 'Trip to Japan' }],
    });
    render(<ReportsHarness />);
    await waitFor(() => expect(screen.getByText('Trip to Japan')).toBeDefined());
    expect(screen.getByText('Custom range')).toBeDefined();
  });
});

describe('Report detail', () => {
  beforeEach(() => installMoneyBridge({ 'reports:get': MONTHLY }));

  it('shows the headline figures', async () => {
    render(<ReportDetail reportId="rep1" onBack={() => {}} />);
    await waitFor(() => expect(screen.getByText('18%')).toBeDefined());
    expect(screen.getByText('Saved')).toBeDefined();
  });

  it('words the direction of change rather than relying on colour', async () => {
    render(<ReportDetail reportId="rep1" onBack={() => {}} />);
    await waitFor(() => expect(screen.getByText(/up 140/)).toBeDefined());
    expect(screen.getByText('unchanged')).toBeDefined();
  });

  it('shows human category names, never raw ids', async () => {
    render(<ReportDetail reportId="rep1" onBack={() => {}} />);
    await waitFor(() => expect(screen.getAllByText('Dining & Takeout').length).toBeGreaterThan(0));
    expect(screen.queryByText(/^cat_/)).toBeNull();
  });

  it('renders a chart of the category breakdown', async () => {
    const { container } = render(<ReportDetail reportId="rep1" onBack={() => {}} />);
    await waitFor(() => expect(screen.getByText('Where it went')).toBeDefined());
    expect(container.querySelector('figure')).not.toBeNull();
  });

  it('includes the recurring audit and largest purchases', async () => {
    render(<ReportDetail reportId="rep1" onBack={() => {}} />);
    await waitFor(() => expect(screen.getByText('netflix')).toBeDefined());
    expect(screen.getByText('Largest purchases')).toBeDefined();
  });

  it('states the assumption behind the annual projection (FR-041)', async () => {
    render(<ReportDetail reportId="rep1" onBack={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/Assumes current spending patterns continue/)).toBeDefined(),
    );
  });

  it('goes back to the list', async () => {
    let backed = false;
    render(<ReportDetail reportId="rep1" onBack={() => (backed = true)} />);
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
    render(<ReportDetail reportId="rep1" onBack={() => {}} />);
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
    render(<ReportDetail reportId="rep1" onBack={() => {}} />);
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
    render(<ReportDetail reportId="rep1" onBack={() => {}} />);
    await waitFor(() => expect(screen.getByText('Worth noticing')).toBeDefined());
    expect(screen.getByText(/3\.1× above your normal range/)).toBeDefined();
  });

  it('handles a missing report without crashing', async () => {
    installMoneyBridge({});
    render(<ReportDetail reportId="nope" onBack={() => {}} />);
    await waitFor(() => expect(screen.getByText('← All reports')).toBeDefined());
  });
});
