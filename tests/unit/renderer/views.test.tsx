// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { installMoneyBridge } from './setup';
import { Dashboard } from '@renderer/views/Dashboard';
import { Register } from '@renderer/views/Register';
import { Recurring } from '@renderer/views/Recurring';
import { Income } from '@renderer/views/Income';
import { Review } from '@renderer/views/Review';
import { Reports } from '@renderer/views/Reports';
import { Health } from '@renderer/views/Health';
import { Settings } from '@renderer/views/Settings';
import { Categories } from '@renderer/views/Categories';
import { App } from '@renderer/App';

afterEach(cleanup);

const DASHBOARD = {
  balances: [],
  cashFlowMinor: { incomeMinor: 520000, spendingMinor: -240700, netMinor: 279300 },
  categoryBreakdown: {
    rows: [
      { categoryId: 'dining', name: 'Dining', totalMinor: -64000, txCount: 14 },
      { categoryId: 'groceries', name: 'Groceries', totalMinor: -38000, txCount: 9 },
    ],
    totalMinor: -102000,
    dataComplete: true,
    staleInstitutions: [],
  },
  whatChanged: ['Dining is running above your normal range'],
  dataComplete: true,
  staleInstitutions: [],
  runway: {
    available: true,
    currentBalanceMinor: 84700,
    projectedMinor: 62000,
    floorMinor: 100000,
    nextIncomeDate: '2026-09-04T00:00:00Z',
    reason: 'Assumes current spending continues',
  },
};

describe('Dashboard', () => {
  beforeEach(() => installMoneyBridge({ 'dashboard:get': DASHBOARD }));

  it('shows the runway, cash flow, and category breakdown', async () => {
    render(<Dashboard onDrill={() => {}} />);
    await waitFor(() => expect(screen.getByText(/projected at payday/)).toBeDefined());
    expect(screen.getByText('Dining')).toBeDefined();
    expect(screen.getByText('Groceries')).toBeDefined();
  });

  it('drills from a category to its transactions in one interaction (SC-018)', async () => {
    let drilled: string | null = null;
    render(<Dashboard onDrill={(id) => (drilled = id)} />);
    await waitFor(() => screen.getByText('Dining'));
    fireEvent.click(screen.getByText('Dining'));
    expect(drilled).toBe('dining');
  });

  it('surfaces what changed', async () => {
    render(<Dashboard onDrill={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/Dining is running above your normal range/)).toBeDefined(),
    );
  });

  it('shows an empty state rather than a blank page when nothing is spent', async () => {
    installMoneyBridge({
      'dashboard:get': {
        ...DASHBOARD,
        categoryBreakdown: { ...DASHBOARD.categoryBreakdown, rows: [] },
      },
    });
    render(<Dashboard onDrill={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Nothing spent this month yet/)).toBeDefined());
  });

  it('renders the qualification banner when data is incomplete', async () => {
    installMoneyBridge({
      'dashboard:get': { ...DASHBOARD, dataComplete: false, staleInstitutions: ['Chase'] },
    });
    render(<Dashboard onDrill={() => {}} />);
    await waitFor(() => expect(screen.getByText(/lower bounds/)).toBeDefined());
  });
});

describe('Register', () => {
  it('lists transactions and shows foreign currency as display-only metadata', async () => {
    installMoneyBridge({
      'transactions:query': {
        rows: [
          {
            id: 't1',
            amountMinor: -4312,
            merchantName: 'Cafe Paris',
            description: 'CAFE PARIS',
            postedDate: '2026-08-29',
            categoryId: 'dining',
            confidence: 0.9,
            needsReview: false,
            isInternalTransfer: false,
            originalCurrency: 'EUR',
            originalAmountMinor: 4000,
          },
        ],
        totalCount: 1,
        dataComplete: true,
        staleInstitutions: [],
      },
    });
    render(<Register initialCategoryId={null} />);
    await waitFor(() => expect(screen.getByText('Cafe Paris')).toBeDefined());
    expect(screen.getByText(/EUR 40\.00/)).toBeDefined();
    expect(screen.getByText('-$43.12')).toBeDefined();
  });

  it('shows an empty state when nothing matches', async () => {
    installMoneyBridge({
      'transactions:query': { rows: [], totalCount: 0, dataComplete: true, staleInstitutions: [] },
    });
    render(<Register initialCategoryId={null} />);
    await waitFor(() => expect(screen.getByText(/No transactions match/)).toBeDefined());
  });
});

describe('Recurring', () => {
  it('shows cadence, cumulative paid, and a price-change marker', async () => {
    installMoneyBridge({
      'recurring:list': [
        {
          id: 'r1',
          merchantKey: 'netflix',
          currentAmountMinor: -1899,
          cadence: 'monthly',
          firstSeenDate: '2026-01-15',
          cumulativePaidMinor: -12792,
          status: 'active',
          amountChanges: [{ oldAmountMinor: -1599, newAmountMinor: -1899, changedAt: '2026-08-01' }],
        },
      ],
    });
    render(<Recurring />);
    await waitFor(() => expect(screen.getByText('netflix')).toBeDefined());
    expect(screen.getByText(/price changed/)).toBeDefined();
    expect(screen.getByText(/monthly/)).toBeDefined();
  });

  it('explains why the ledger is empty rather than showing a blank list', async () => {
    installMoneyBridge({ 'recurring:list': [] });
    render(<Recurring />);
    await waitFor(() => expect(screen.getByText(/No recurring charges detected yet/)).toBeDefined());
  });
});

describe('Income', () => {
  it('offers to confirm an unconfirmed pattern (FR-071)', async () => {
    installMoneyBridge({
      'income:list': [
        {
          id: 'i1',
          merchantKey: 'acme-payroll',
          expectedAmountMinor: 260000,
          cadence: 'biweekly',
          nextExpectedDate: '2026-09-04T00:00:00Z',
          detectionConfidence: 0.92,
          isUserConfirmed: false,
        },
      ],
    });
    render(<Income />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toBeDefined());
  });

  it('says projections are withheld when no income is detected', async () => {
    installMoneyBridge({ 'income:list': [] });
    render(<Income />);
    await waitFor(() => expect(screen.getByText(/withheld rather than guessed/)).toBeDefined());
  });
});

describe('Review', () => {
  const item = {
    transaction: {
      id: 't1',
      amountMinor: -4782,
      merchantName: 'Target',
      description: 'TARGET 00023415',
      postedDate: '2026-08-29',
      categoryId: 'home',
      confidence: 0.62,
      needsReview: true,
      isInternalTransfer: false,
      originalCurrency: null,
      originalAmountMinor: null,
    },
    guessCategoryId: 'home',
    confidence: 0.62,
    reasoning: '60% of your 40 prior purchases here',
  };

  it('shows the reasoning behind each guess (US6 AS1)', async () => {
    installMoneyBridge({ 'review:queue': { rows: [item], totalCount: 1 } });
    render(<Review />);
    await waitFor(() =>
      expect(screen.getByText(/60% of your 40 prior purchases here/)).toBeDefined(),
    );
  });

  it('offers bulk actions once something is selected (FR-067)', async () => {
    installMoneyBridge({ 'review:queue': { rows: [item], totalCount: 1 } });
    render(<Review />);
    await waitFor(() => screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('1 selected')).toBeDefined();
  });

  it('celebrates an empty queue rather than showing a blank list', async () => {
    installMoneyBridge({ 'review:queue': { rows: [], totalCount: 0 } });
    render(<Review />);
    await waitFor(() => expect(screen.getByText(/Nothing needs your review/)).toBeDefined());
  });
});

describe('Reports, Health, Settings, Categories', () => {
  it('lists reports with their completeness', async () => {
    installMoneyBridge({
      'reports:list': [
        {
          id: 'rep1',
          type: 'monthly_report',
          periodStart: '2026-08-01T00:00:00Z',
          periodEnd: '2026-09-01T00:00:00Z',
          dataComplete: false,
          wasLate: true,
          totalSpendingMinor: -425000,
          savingsRate: 0.18,
        },
      ],
    });
    render(<Reports />);
    await waitFor(() => expect(screen.getByText(/incomplete data/)).toBeDefined());
    expect(screen.getByText(/generated late/)).toBeDefined();
  });

  it('shows per-account sync status and the redaction promise', async () => {
    installMoneyBridge({
      'health:get': {
        perAccount: [
          {
            institutionId: 'i1',
            institutionName: 'Chase',
            status: 'reauth_required',
            lastSuccessfulSync: '2026-08-20T00:00:00Z',
            lastAttemptedSync: '2026-08-29T00:00:00Z',
            recentFailures: 4,
          },
        ],
        metrics: {
          syncDurationMsP50: 400,
          transactionsProcessed: 2847,
          localResolutionRate: 0.72,
          droppedDiagnosticEvents: 0,
        },
      },
    });
    render(<Health />);
    await waitFor(() => expect(screen.getByText('Chase')).toBeDefined());
    expect(screen.getByText(/reauth required/)).toBeDefined();
    expect(screen.getByText(/no merchant names, amounts, balances, or credentials/)).toBeDefined();
  });

  it('carries the FR-061 disclosure beside the switch that governs it', async () => {
    installMoneyBridge({
      'settings:get': {
        confidenceThreshold: 0.8,
        pollIntervalMinutes: 60,
        categorizationMode: 'hybrid',
        timeZone: 'America/New_York',
      },
      'setup:status': {
        plaidConfigured: true,
        categorizationConfigured: true,
        accountCount: 3,
        encryptionAvailable: true,
      },
    });
    render(<Settings />);
    await waitFor(() =>
      expect(screen.getByText(/Never account numbers, balances, credentials, or totals/)).toBeDefined(),
    );
  });

  it('explains that hiding a category preserves history', async () => {
    installMoneyBridge({
      'categories:list': [
        { id: 'food', name: 'Food', parentId: null, isSystem: true, isHidden: false },
        { id: 'dining', name: 'Dining', parentId: 'food', isSystem: true, isHidden: false },
      ],
    });
    render(<Categories />);
    await waitFor(() => expect(screen.getByText('Food')).toBeDefined());
    expect(screen.getByText(/historical totals still add up/)).toBeDefined();
  });
});

describe('App shell', () => {
  it('renders navigation and switches views', async () => {
    installMoneyBridge({ 'dashboard:get': DASHBOARD, 'recurring:list': [] });
    render(<App />);
    await waitFor(() => expect(screen.getByText('Dashboard')).toBeDefined());
    fireEvent.click(screen.getByText('Recurring'));
    await waitFor(() => expect(screen.getByText(/No recurring charges detected yet/)).toBeDefined());
  });
});
