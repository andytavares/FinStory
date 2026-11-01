// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { installMoneyBridge } from './setup';
import { Dashboard } from '@renderer/views/Dashboard';
import { Register } from '@renderer/views/Register';
import { Recurring } from '@renderer/views/Recurring';
import { Income } from '@renderer/views/Income';
import { Reports } from '@renderer/views/Reports';
import { Health } from '@renderer/views/Health';
import { Settings } from '@renderer/views/Settings';
import { Categories } from '@renderer/views/Categories';
import { App } from '@renderer/App';
import { Setup } from '@renderer/views/Setup';
import { Alerts } from '@renderer/views/Alerts';
import { Accounts } from '@renderer/views/Accounts';

afterEach(cleanup);

const DASHBOARD = {
  balances: [],
  cashFlowMinor: { incomeMinor: 520000, spendingMinor: -240700, netMinor: 279300 },
  categoryBreakdown: {
    rows: [
      { categoryId: 'dining', name: 'Dining', parentId: 'food', parentName: 'Food', totalMinor: -64000, txCount: 14 },
      { categoryId: 'groceries', name: 'Groceries', parentId: 'food', parentName: 'Food', totalMinor: -38000, txCount: 9 },
    ],
    totalMinor: -102000,
    dataComplete: true,
    staleInstitutions: [],
  },
  whatChanged: ['Dining is running above your normal range'],
  dataComplete: true,
  staleInstitutions: [],
  kpis: {
    spent: { thisMonthMinor: 240700, seriesMinor: [100000, 240700] },
    income: { thisMonthMinor: 520000, seriesMinor: [500000, 520000], nextDeposit: null },
    recurring: { monthlyMinor: 0, count: 0, candidateCount: 0 },
    safeToSpendPerDayMinor: null,
  },
  upcomingRecurring: [],
  runwaySeries: null,
  whereItWent: [],
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
    await waitFor(() => expect(screen.getByText('Runway to payday')).toBeDefined());
    // Grouped under the parent, collapsed by default.
    expect(screen.getAllByText('Food').length).toBeGreaterThan(0);
    expect(screen.queryByText('Dining')).toBeNull();
  });

  it('expands a parent group to reveal its subcategories', async () => {
    render(<Dashboard onDrill={() => {}} />);
    await waitFor(() => screen.getByLabelText('Expand Food'));
    fireEvent.click(screen.getByLabelText('Expand Food'));
    expect(screen.getByText('Dining')).toBeDefined();
    expect(screen.getByText('Groceries')).toBeDefined();
  });

  it('drills from a category to its transactions in one interaction (SC-018)', async () => {
    let drilled: string | null = null;
    render(<Dashboard onDrill={(id) => (drilled = id)} />);
    await waitFor(() => screen.getByLabelText('Expand Food'));
    fireEvent.click(screen.getByLabelText('Expand Food'));
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
    const bridge = {
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
            userMerchantName: null,
            userNote: null,
            userExcluded: false,
            userRecurringOverride: null,
          },
        ],
        totalCount: 1,
        dataComplete: true,
        staleInstitutions: [],
      },
    };
    installMoneyBridge({
      ...bridge,
      'categories:list': [
        { id: 'dining', name: 'Dining', parentId: null, isHidden: false, mergedIntoId: null },
      ],
    });
    render(<Register initialCategoryId={null} />);
    await waitFor(() => expect(screen.getByText('Cafe Paris')).toBeDefined());
    expect(screen.getByText(/EUR 40\.00/)).toBeDefined();
    // Outflow now renders with an explicit minus sign alongside its colour.
    expect(screen.getByText('$43.12')).toBeDefined();
    expect(screen.getByText('−')).toBeDefined();
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
          merchantName: 'Netflix',
          currentAmountMinor: -1899,
          cadence: 'monthly',
          firstSeenDate: '2026-01-15',
          cumulativePaidMinor: -12792,
          status: 'active',
          nextExpectedDate: '2026-09-15',
          monthlyCostMinor: 1899,
          yearlyCostMinor: 22788,
          amountChanges: [{ oldAmountMinor: -1599, newAmountMinor: -1899, changedAt: '2026-08-01' }],
        },
      ],
    });
    render(<Recurring onOpenMerchant={() => {}} />);
    await waitFor(() => expect(screen.getByText('Netflix')).toBeDefined());
    expect(screen.getByText(/Was \$15.99 until Aug/)).toBeDefined();
    expect(screen.getByText(/Monthly · since/)).toBeDefined();
  });

  it('explains why the ledger is empty rather than showing a blank list', async () => {
    installMoneyBridge({ 'recurring:list': [] });
    render(<Recurring onOpenMerchant={() => {}} />);
    await waitFor(() => expect(screen.getByText(/No recurring charges here yet/)).toBeDefined());
  });
});

describe('Income', () => {
  it('offers to confirm an unconfirmed pattern (FR-071)', async () => {
    installMoneyBridge({
      'income:list': [
        {
          id: 'i1',
          merchantKey: 'acme-payroll',
          merchantName: 'ACME PAYROLL',
          expectedAmountMinor: 260000,
          cadence: 'biweekly',
          nextExpectedDate: '2026-09-04T00:00:00Z',
          daysUntilNext: 3,
          detectionConfidence: 0.92,
          isUserConfirmed: false,
        },
      ],
    });
    render(<Income onOpenMerchant={() => {}} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toBeDefined());
  });

  it('says projections are withheld when no income is detected', async () => {
    installMoneyBridge({ 'income:list': [] });
    render(<Income onOpenMerchant={() => {}} />);
    await waitFor(() => expect(screen.getByText(/withheld rather than guessed/)).toBeDefined());
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
          headline: 'You spent $4,250',
          series: [100, 200],
        },
      ],
    });
    render(<Reports openReportId={null} onOpenReport={() => {}} onCloseReport={() => {}} />);
    await waitFor(() => expect(screen.getByText(/incomplete data/)).toBeDefined());
    expect(screen.getByText(/generated late/)).toBeDefined();
  });

  it('shows per-account sync status and the redaction promise', async () => {
    installMoneyBridge({
      'health:get': {
        categorization: { provider: 'ollama', model: 'llama3.1:8b', localOnly: true, reason: 'ok' },
        encryption: { databaseEncrypted: true, keysInKeychain: true },
        updates: { version: '1.0.0' },
        syncHistory: [],
        contents: {
          institutions: 1,
          accounts: 1,
          everydayAccounts: 1,
          transactions: 12,
          transactionsInEverydayAccounts: 12,
          transactionsThisMonth: 4,
          categorized: 10,
          uncategorizable: 2,
        },
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
    await waitFor(() => expect(screen.getByText(/Chase needs sign-in/)).toBeDefined());
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
        plaidClientIdConfigured: true,
        plaidSecretConfigured: true,
        plaidEnv: 'sandbox' as const,
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
        { id: 'food', name: 'Food', parentId: null, isSystem: true, isHidden: false, mergedIntoId: null, usageCount: 0, childCount: 1, needsReassignment: true },
        { id: 'dining', name: 'Dining', parentId: 'food', isSystem: true, isHidden: false, mergedIntoId: null, usageCount: 0, childCount: 0, needsReassignment: false },
      ],
    });
    render(<Categories />);
    await waitFor(() => expect(screen.getByText('Food')).toBeDefined());
    expect(screen.getByText(/historical totals still add up/)).toBeDefined();
    // Subcategories can be added inline from this screen.
    expect(screen.getAllByText('+ Subcategory').length).toBeGreaterThan(0);
  });

  it('adds a subcategory under a parent', async () => {
    installMoneyBridge({
      'categories:list': [
        { id: 'food', name: 'Food', parentId: null, isSystem: true, isHidden: false, mergedIntoId: null, usageCount: 0, childCount: 1, needsReassignment: true },
      ],
      'categories:create': { id: 'new' },
    });
    render(<Categories />);
    await waitFor(() => screen.getByText('+ Subcategory'));
    fireEvent.click(screen.getByText('+ Subcategory'));
    expect(screen.getByLabelText('New subcategory under Food')).toBeDefined();
  });

  it('offers hide and merge on every category', async () => {
    installMoneyBridge({
      'categories:list': [
        { id: 'food', name: 'Food', parentId: null, isSystem: true, isHidden: false, mergedIntoId: null, usageCount: 0, childCount: 1, needsReassignment: true },
      ],
    });
    render(<Categories />);
    await waitFor(() => screen.getByLabelText('Actions for Food'));
    fireEvent.click(screen.getByLabelText('Actions for Food'));
    expect(screen.getByText('Hide')).toBeDefined();
    expect(screen.getByText('Merge')).toBeDefined();
  });
});

describe('App shell', () => {
  it('renders navigation and switches views', async () => {
    installMoneyBridge({ 'dashboard:get': DASHBOARD, 'recurring:list': [] });
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dashboard' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Recurring' }));
    await waitFor(() => expect(screen.getByText(/No recurring charges here yet/)).toBeDefined());
  });
});

describe('Setup (first run)', () => {
  const ok = {
    plaidConfigured: false,
        plaidClientIdConfigured: true,
        plaidSecretConfigured: true,
        plaidEnv: 'sandbox' as const,
    categorizationConfigured: false,
    accountCount: 0,
    encryptionAvailable: true,
  };

  it('asks for Plaid credentials and makes the one-time promise explicit', () => {
    render(<Setup status={ok} onComplete={() => {}} />);
    expect(screen.getByText(/Connect your accounts/)).toBeDefined();
    expect(screen.getByText(/no logging, no reconciling, no budgets to allocate/)).toBeDefined();
  });

  it('disables the save button until both required fields are filled', () => {
    render(<Setup status={ok} onComplete={() => {}} />);
    const button = screen.getByRole('button', { name: /Save and continue/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables saving once client id and secret are present', () => {
    render(<Setup status={ok} onComplete={() => {}} />);
    fireEvent.change(screen.getByLabelText('Client ID'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText('Secret'), { target: { value: 'xyz' } });
    expect((screen.getByRole('button', { name: /Save and continue/ }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('refuses to continue when encryption is unavailable (Constitution VII)', () => {
    render(<Setup status={{ ...ok, encryptionAvailable: false }} onComplete={() => {}} />);
    expect(screen.getByText(/Money cannot start/)).toBeDefined();
    expect(screen.queryByRole('button', { name: /Save and continue/ })).toBeNull();
  });
});

describe('Alerts', () => {
  const rule = {
    id: 'r1',
    type: 'large_purchase',
    label: null,
    thresholdMinor: 20000,
    windowMinutes: null,
    enabled: true,
    isSystem: true,
  };

  it('lets the user configure each rule (FR-033)', async () => {
    installMoneyBridge({ 'alerts:list': [], 'alertRules:list': [rule] });
    render(<Alerts />);
    await waitFor(() => expect(screen.getByLabelText(/Threshold for/)).toBeDefined());
    // Threshold is editable, not just on/off.
    fireEvent.click(screen.getByRole('button', { name: '+ New alert' }));
    expect(screen.getByRole('button', { name: 'Add alert' })).toBeDefined();
  });

  it('shows when an alert was detected late, while the app was closed (FR-057)', async () => {
    installMoneyBridge({
      'alerts:list': [
        {
          id: 'a1',
          type: 'large_purchase',
          eventOccurredAt: '2026-08-01T10:00:00Z',
          detectedAt: '2026-08-29T10:00:00Z',
          dismissed: false,
        },
      ],
      'alertRules:list': [],
    });
    render(<Alerts />);
    await waitFor(() =>
      expect(screen.getByText(/detected later, while Money was closed/)).toBeDefined(),
    );
  });

  it('dismisses an instance without disabling the rule (FR-032)', async () => {
    installMoneyBridge({
      'alerts:list': [
        {
          id: 'a1',
          type: 'large_purchase',
          eventOccurredAt: '2026-08-29T10:00:00Z',
          detectedAt: '2026-08-29T10:05:00Z',
          dismissed: false,
        },
      ],
      'alertRules:list': [rule],
    });
    render(<Alerts />);
    await waitFor(() => expect(screen.getByText('Dismiss')).toBeDefined());
    // The rule toggle is still present and on.
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('says nothing has needed attention rather than showing a blank list', async () => {
    installMoneyBridge({ 'alerts:list': [], 'alertRules:list': [] });
    render(<Alerts />);
    await waitFor(() =>
      expect(screen.getByText(/Nothing has needed your attention/)).toBeDefined(),
    );
  });
});

describe('Accounts', () => {
  it('invites connecting when nothing is linked', async () => {
    installMoneyBridge({ 'institutions:list': [] });
    render(<Accounts />);
    await waitFor(() => expect(screen.getByText(/No accounts connected yet/)).toBeDefined());
    expect(screen.getByRole('button', { name: 'Connect an account' })).toBeDefined();
  });

  it('lists each account individually with its balance', async () => {
    installMoneyBridge({
      'institutions:list': [
        {
          id: 'i1',
          institutionName: 'Chase',
          status: 'healthy',
          lastSyncedAt: new Date().toISOString(),
          accountCount: 2,
          accounts: [
            { id: 'a1', name: 'Everyday Checking', mask: '4321', type: 'depository', subtype: 'checking', currentBalanceMinor: 84_700, balanceAsOf: new Date().toISOString(), isEveryday: true },
            { id: 'a2', name: 'Rainy Day Savings', mask: '9911', type: 'depository', subtype: 'savings', currentBalanceMinor: 1_200_000, balanceAsOf: new Date().toISOString(), isEveryday: false },
          ],
        },
      ],
    });
    render(<Accounts />);
    await waitFor(() => expect(screen.getByText('Everyday Checking')).toBeDefined());
    expect(screen.getByText('Rainy Day Savings')).toBeDefined();
    expect(screen.getByText('$847.00')).toBeDefined();
    expect(screen.getByText('$12,000.00')).toBeDefined();
  });

  it('offers a day-to-day toggle per account, off for savings', async () => {
    installMoneyBridge({
      'institutions:list': [
        {
          id: 'i1',
          institutionName: 'Chase',
          status: 'healthy',
          lastSyncedAt: new Date().toISOString(),
          accountCount: 2,
          accounts: [
            { id: 'a1', name: 'Everyday Checking', mask: null, type: 'depository', subtype: 'checking', currentBalanceMinor: 1, balanceAsOf: null, isEveryday: true },
            { id: 'a2', name: 'Rainy Day Savings', mask: null, type: 'depository', subtype: 'savings', currentBalanceMinor: 1, balanceAsOf: null, isEveryday: false },
          ],
        },
      ],
    });
    render(<Accounts />);
    await waitFor(() =>
      expect(screen.getByLabelText('Include Everyday Checking in day-to-day spending')).toBeDefined(),
    );
    const savings = screen.getByLabelText('Include Rainy Day Savings in day-to-day spending');
    expect(savings.getAttribute('aria-checked')).toBe('false');
    expect(
      screen
        .getByLabelText('Include Everyday Checking in day-to-day spending')
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('explains why savings should be excluded', async () => {
    installMoneyBridge({ 'institutions:list': [] });
    render(<Accounts />);
    await waitFor(() =>
      expect(screen.getByText(/so they do not inflate runway/)).toBeDefined(),
    );
  });

  it('shows an unknown balance honestly rather than as zero', async () => {
    installMoneyBridge({
      'institutions:list': [
        {
          id: 'i1',
          institutionName: 'Chase',
          status: 'healthy',
          lastSyncedAt: null,
          accountCount: 1,
          accounts: [
            { id: 'a1', name: 'Card', mask: null, type: 'credit', subtype: null, currentBalanceMinor: null, balanceAsOf: null, isEveryday: true },
          ],
        },
      ],
    });
    render(<Accounts />);
    await waitFor(() => expect(screen.getByText('balance unknown')).toBeDefined());
  });

  it('lists connected institutions with their sync age', async () => {
    installMoneyBridge({
      'institutions:list': [
        {
          id: 'i1',
          institutionName: 'Chase',
          status: 'healthy',
          lastSyncedAt: new Date().toISOString(),
          accountCount: 2,
          accounts: [
            {
              id: 'a1',
              name: 'Everyday Checking',
              mask: '4321',
              type: 'depository',
              subtype: 'checking',
              currentBalanceMinor: 84_700,
              balanceAsOf: new Date().toISOString(),
              isEveryday: true,
            },
            {
              id: 'a2',
              name: 'Rainy Day Savings',
              mask: '9911',
              type: 'depository',
              subtype: 'savings',
              currentBalanceMinor: 1_200_000,
              balanceAsOf: new Date().toISOString(),
              isEveryday: false,
            },
          ],
        },
      ],
    });
    render(<Accounts />);
    await waitFor(() => expect(screen.getByText('Chase')).toBeDefined());
    expect(screen.getByText('Net $12,847.00 across 2 accounts')).toBeDefined();
    expect(screen.getByText('Synced just now')).toBeDefined();
  });

  it('offers reconnect only for an unhealthy institution', async () => {
    installMoneyBridge({
      'institutions:list': [
        { id: 'i1', institutionName: 'Chase', status: 'reauth_required', lastSyncedAt: null, accountCount: 1, accounts: [] },
      ],
    });
    render(<Accounts />);
    await waitFor(() => expect(screen.getByText('Sign in again')).toBeDefined());
  });

  it('surfaces a failure to start the connection', async () => {
    installMoneyBridge({ 'institutions:list': [] });
    render(<Accounts />);
    await waitFor(() => screen.getByRole('button', { name: 'Connect an account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect an account' }));
    // link:start has no stub, so the bridge rejects — the UI must say so.
    await waitFor(() => expect(screen.getByText(/No stub for link:start/)).toBeDefined());
  });
});

describe('App shell navigation covers every area', () => {
  it('routes to each view without error', async () => {
    installMoneyBridge({
      'setup:status': {
        plaidConfigured: true,
        plaidClientIdConfigured: true,
        plaidSecretConfigured: true,
        plaidEnv: 'sandbox' as const,
        categorizationConfigured: true,
        accountCount: 1,
        encryptionAvailable: true,
      },
      'dashboard:get': DASHBOARD,
      'recurring:list': [],
      'income:list': [],
      'review:queue': { rows: [], totalCount: 0 },
      'reports:list': [],
      'alerts:list': [],
      'alertRules:list': [],
      'categories:list': [],
      'institutions:list': [],
      'transactions:query': { rows: [], totalCount: 0, dataComplete: true, staleInstitutions: [] },
      'health:get': {
        categorization: { provider: 'ollama', model: 'llama3.1:8b', localOnly: true, reason: 'ok' },
        encryption: { databaseEncrypted: true, keysInKeychain: true },
        updates: { version: '1.0.0' },
        syncHistory: [],
        contents: {
          institutions: 1,
          accounts: 1,
          everydayAccounts: 1,
          transactions: 12,
          transactionsInEverydayAccounts: 12,
          transactionsThisMonth: 4,
          categorized: 10,
          uncategorizable: 2,
        },
        perAccount: [],
        metrics: {
          syncDurationMsP50: null,
          transactionsProcessed: 0,
          localResolutionRate: null,
          droppedDiagnosticEvents: 0,
        },
      },
      'settings:get': {
        confidenceThreshold: 0.8,
        pollIntervalMinutes: 60,
        categorizationMode: 'hybrid',
        modelProvider: 'anthropic',
        anthropicModel: 'claude-haiku-4-5',
        ollamaModel: '',
        ollamaBaseUrl: 'http://localhost:11434',
        timeZone: 'America/New_York',
      },
      'models:listOllama': [],
    });
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dashboard' })).toBeDefined());

    for (const label of [
      'Transactions',
      'Recurring',
      'Income',
      'Review',
      'Alerts',
      'Reports',
      'Health',
      'Categories',
      'Accounts',
      'Settings',
    ]) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() => expect(screen.getByRole('button', { name: label })).toBeDefined());
    }
  });

  it('offers back and forward, disabled until there is history', async () => {
    installMoneyBridge({
      'setup:status': {
        plaidConfigured: true,
        plaidClientIdConfigured: true,
        plaidSecretConfigured: true,
        plaidEnv: 'sandbox' as const,
        categorizationConfigured: true,
        accountCount: 1,
        encryptionAvailable: true,
      },
      'dashboard:get': DASHBOARD,
      'recurring:list': [],
    });
    render(<App />);
    await waitFor(() => screen.getByLabelText('Back'));
    expect((screen.getByLabelText('Back') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Forward') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Recurring' }));
    await waitFor(() =>
      expect((screen.getByLabelText('Back') as HTMLButtonElement).disabled).toBe(false),
    );

    fireEvent.click(screen.getByLabelText('Back'));
    await waitFor(() =>
      expect((screen.getByLabelText('Forward') as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it('goes back out of a category drill-down', async () => {
    installMoneyBridge({
      'setup:status': {
        plaidConfigured: true,
        plaidClientIdConfigured: true,
        plaidSecretConfigured: true,
        plaidEnv: 'sandbox' as const,
        categorizationConfigured: true,
        accountCount: 1,
        encryptionAvailable: true,
      },
      'dashboard:get': DASHBOARD,
      'transactions:query': { rows: [], totalCount: 0, dataComplete: true, staleInstitutions: [] },
      'categories:list': [],
    });
    render(<App />);
    await waitFor(() => screen.getByLabelText('Expand Food'));
    fireEvent.click(screen.getByLabelText('Expand Food'));
    fireEvent.click(screen.getByText('Dining'));
    await waitFor(() => expect(screen.getByText(/No transactions match/)).toBeDefined());
    fireEvent.click(screen.getByLabelText('Back'));
    await waitFor(() => expect(screen.getByText('By category')).toBeDefined());
  });

  it('shows setup first when Plaid is not configured', async () => {
    installMoneyBridge({
      'setup:status': {
        plaidConfigured: false,
        plaidClientIdConfigured: true,
        plaidSecretConfigured: true,
        plaidEnv: 'sandbox' as const,
        categorizationConfigured: false,
        accountCount: 0,
        encryptionAvailable: true,
      },
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Connect your accounts/)).toBeDefined());
  });
});
