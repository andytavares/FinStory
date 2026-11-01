import { EMPTY_SYNC } from '@main/sync/outcome';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const savePath = vi.hoisted(() => ({ value: '' }));
const saveDialogOptions = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
  dialog: {
    showSaveDialog: async (options: unknown) => {
      saveDialogOptions.value = options;
      return { canceled: false, filePath: savePath.value };
    },
    showOpenDialog: async () => ({ canceled: true }),
  },
  shell: { openExternal: async () => {} },
}));

const { openDatabase } = await import('@main/db/client');
const { runMigrations } = await import('@main/db/migrate');
const { Services } = await import('@main/services/index');
const { defaultCategories } = await import('@main/db/seed-categories');
const schema = await import('@main/db/schema');
const { DiagnosticLogger } = await import('@main/diagnostics/logger');
const { MemorySink } = await import('@main/diagnostics/sink');
const { CategorizationPipeline } = await import('@main/categorization/pipeline');
const { TestClock } = await import('@shared/clock');
import type { DatabaseHandle } from '@main/db/client';
import { MemorySecretStore } from '../fixtures/memory-secret-store';

const MIGRATIONS = join(process.cwd(), 'src/main/db/migrations');
const NOW = new Date('2026-08-29T12:00:00Z');
const RANGE = { periodStart: '2026-08-01T00:00:00Z', periodEnd: '2026-09-01T00:00:00Z' };

describe('Data for the redesigned screens', () => {
  let dir: string;
  let handle: DatabaseHandle;
  let services: InstanceType<typeof Services>;
  let printed: number;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'money-screens-'));
    printed = 0;
    const store = new MemorySecretStore();
    handle = await openDatabase(dir, store);
    runMigrations(handle, MIGRATIONS);
    const db = handle.db;
    await db.insert(schema.categories).values(defaultCategories());
    await db.insert(schema.institutions).values({
      id: 'inst_1',
      plaidItemId: 'item_1',
      accessTokenEncrypted: 'sealed',
      institutionName: 'Chase',
      syncCursor: 'cursor_1',
      status: 'healthy',
      lastSyncedAt: '2026-08-29T11:00:00Z',
      lastAttemptedSyncAt: '2026-08-29T11:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
    });
    await db.insert(schema.accounts).values([
      {
        id: 'acct_1',
        institutionId: 'inst_1',
        plaidAccountId: 'pa_1',
        name: 'Everyday Checking',
        mask: '4321',
        type: 'depository',
        subtype: 'checking',
        currentBalanceMinor: 300_000,
        balanceAsOf: '2026-08-29T11:00:00Z',
        isEveryday: true,
      },
      {
        id: 'acct_2',
        institutionId: 'inst_1',
        plaidAccountId: 'pa_2',
        name: 'Savings',
        mask: '9999',
        type: 'depository',
        subtype: 'savings',
        currentBalanceMinor: 1_000_000,
        balanceAsOf: '2026-08-29T11:00:00Z',
        isEveryday: false,
      },
    ]);

    const txs = [
      ['txn_1', -6_400, 'uber eats', 'UBER EATS', '2026-08-05', 'dining', 'rule', false],
      ['txn_2', -3_800, 'target', 'TARGET 00023415', '2026-08-09', 'groceries', 'model', true],
      ['txn_3', -12_000, 'landlord', 'RENT', '2026-08-01', 'rent', 'user', false],
      ['txn_4', 520_000, 'acme-payroll', 'ACME PAYROLL', '2026-08-15', 'income', 'model', false],
      ['txn_5', -1_599, 'netflix', 'NETFLIX.COM', '2026-08-15', 'streaming', 'local_history', false],
      ['txn_j1', -10_000, 'target', 'TARGET 00023415', '2026-07-10', 'groceries', 'model', false],
      ['txn_j2', 520_000, 'acme-payroll', 'ACME PAYROLL', '2026-07-15', 'income', 'model', false],
    ] as const;
    for (const [id, amountMinor, merchantKey, description, postedDate, categoryId, source, review] of txs) {
      await db.insert(schema.transactions).values({
        id,
        accountId: 'acct_1',
        plaidTransactionId: `p_${id}`,
        amountMinor,
        merchantName: description,
        merchantKey,
        description,
        postedDate,
        datetime: `${postedDate}T14:00:00Z`,
        pending: false,
        settlementState: 'posted',
        isInternalTransfer: false,
        reversesTransactionId: null,
        originalCurrency: null,
        originalAmountMinor: null,
        firstSeenAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      });
      await db.insert(schema.categorizations).values({
        id: `cat_${id}`,
        transactionId: id,
        categoryId,
        confidence: 0.9,
        source,
        isConfirmed: false,
        needsReview: review,
        reasoning: review ? 'mixed-use merchant' : null,
        supersededBy: null,
        createdAt: NOW.toISOString(),
      });
    }
    await db.insert(schema.merchantProfiles).values({
      merchantKey: 'target',
      categoryDistribution: JSON.stringify({ groceries: 5, shopping: 3, dining: 1 }),
      userConfirmedCategoryId: null,
      transactionCount: 9,
      lastUpdatedAt: NOW.toISOString(),
    });
    await db.insert(schema.incomeSources).values({
      id: 'inc_1',
      accountId: 'acct_1',
      merchantKey: 'acme-payroll',
      expectedAmountMinor: 520_000,
      cadence: 'monthly',
      nextExpectedDate: '2026-09-15T00:00:00Z',
      detectionConfidence: 0.95,
      isUserConfirmed: true,
      isActive: true,
    });
    await db.insert(schema.recurringCharges).values([
      {
        id: 'rc_1',
        merchantKey: 'netflix',
        currentAmountMinor: -1_599,
        cadence: 'monthly',
        firstSeenDate: '2026-01-15',
        lastSeenDate: '2026-08-15',
        cumulativePaidMinor: -12_792,
        status: 'active',
        detectedAt: NOW.toISOString(),
        userAcknowledged: false,
      },
      {
        id: 'rc_2',
        merchantKey: 'old-gym',
        currentAmountMinor: -4_000,
        cadence: 'monthly',
        firstSeenDate: '2025-01-15',
        lastSeenDate: '2026-03-15',
        cumulativePaidMinor: -60_000,
        status: 'inactive',
        detectedAt: NOW.toISOString(),
        userAcknowledged: false,
      },
    ]);
    await db.insert(schema.recurringChargeAmountChanges).values({
      id: 'ac_1',
      recurringChargeId: 'rc_1',
      oldAmountMinor: -1_299,
      newAmountMinor: -1_599,
      changedAt: '2026-06-15T00:00:00Z',
    });
    const report = (id: string, start: string, end: string, spending: number, income: number) => ({
      id,
      type: 'monthly_report' as const,
      periodStart: start,
      periodEnd: end,
      content: JSON.stringify({
        totalIncomeMinor: income,
        totalSpendingMinor: spending,
        savingsMinor: income + spending,
        savingsRate: (income + spending) / income,
      }),
      generatedAt: NOW.toISOString(),
      deliveredAt: null,
      wasLate: false,
      dataComplete: true,
    });
    await db.insert(schema.periodReports).values([
      report('rep_jun', '2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z', -300_000, 500_000),
      report('rep_jul', '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z', -412_000, 520_000),
    ]);
    await db.insert(schema.diagnosticEvents).values([
      {
        occurredAt: '2026-08-29T11:00:00Z',
        eventType: 'sync_attempt',
        outcome: 'success',
        subjectId: null,
        durationMs: 412,
        errorCode: null,
      },
      {
        occurredAt: '2026-08-29T10:00:00Z',
        eventType: 'sync_failure',
        outcome: 'failure',
        subjectId: 'inst_1',
        durationMs: 30_000,
        errorCode: 'network',
      },
      {
        occurredAt: '2026-08-29T09:00:00Z',
        eventType: 'categorization',
        outcome: 'success',
        subjectId: null,
        durationMs: 5,
        errorCode: null,
      },
    ]);

    services = new Services({
      handle,
      userDataDir: dir,
      clock: new TestClock(NOW),
      logger: new DiagnosticLogger(new MemorySink(), new TestClock(NOW)),
      store,
      pipeline: new CategorizationPipeline(
        { classify: async () => ({ categoryId: 'dining', confidence: 0.9, reasoning: '' }) },
        { confidenceThreshold: 0.8 },
      ),
      sync: async () => EMPTY_SYNC,
      buildPipeline: () =>
        Promise.resolve(
          new CategorizationPipeline(
            { classify: async () => ({ categoryId: 'dining', confidence: 0.9, reasoning: '' }) },
            { confidenceThreshold: 0.8 },
          ),
        ),
      describeModel: () =>
        Promise.resolve({ provider: 'ollama', model: 'qwen3', localOnly: false, reason: 'Local model' }),
      emit: () => {},
      appVersion: '1.2.3',
      printToPdf: async () => {
        printed += 1;
        return Buffer.from('%PDF-fake');
      },
    });
    await services.updateSettings({ timeZone: 'UTC' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    handle.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('dashboard', () => {
    type Dashboard = {
      kpis: {
        spent: { currentMinor: number; seriesMinor: number[] };
        income: {
          currentMinor: number;
          seriesMinor: number[];
          nextDeposit: { date: string; amountMinor: number; merchantName: string } | null;
        };
        recurring: { monthlyMinor: number; count: number; candidateCount: number; seriesMinor: number[] };
        safeToSpendPerDayMinor: number | null;
      };
      upcomingRecurring: Array<{ merchantName: string; date: string; amountMinor: number }>;
      runwaySeries: {
        floorMinor: number;
        points: Array<{ date: string; balanceMinor: number }>;
      } | null;
      whereItWent: Array<{ groupId: string; name: string; spentMinor: number }>;
    };
    const load = async (period?: 'week' | 'month' | 'year'): Promise<Dashboard> =>
      (await services.dashboard({ ...RANGE, ...(period ? { period } : {}) })) as Dashboard;
    const addSpend = async (id: string, amountMinor: number, postedDate: string): Promise<void> => {
      await handle.db.insert(schema.transactions).values({
        id, accountId: 'acct_1', plaidTransactionId: `p_${id}`, amountMinor, merchantName: 'CORNER CAFE',
        merchantKey: 'corner-cafe', description: 'CORNER CAFE', postedDate, datetime: `${postedDate}T14:00:00Z`,
        pending: false, settlementState: 'posted', isInternalTransfer: false, reversesTransactionId: null,
        originalCurrency: null, originalAmountMinor: null, firstSeenAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
      });
      await handle.db.insert(schema.categorizations).values({
        id: `cat_${id}`, transactionId: id, categoryId: 'dining', confidence: 0.9, source: 'model',
        isConfirmed: false, needsReview: false, reasoning: null, supersededBy: null, createdAt: NOW.toISOString(),
      });
    };

    it('gives six months of spending, ending with this month', async () => {
      const { kpis } = await load();
      expect(kpis.spent.currentMinor).toBe(23_799);
      expect(kpis.spent.seriesMinor).toEqual([0, 0, 0, 0, 10_000, 23_799]);
    });

    it('totals the current week and the five before it, weeks starting Monday', async () => {
      await addSpend('txn_w1', -2_500, '2026-08-25');
      const { kpis, whereItWent } = await load('week');
      expect(kpis.spent.currentMinor).toBe(2_500);
      expect(kpis.spent.seriesMinor).toEqual([0, 12_000, 10_200, 1_599, 0, 2_500]);
      expect(kpis.income.currentMinor).toBe(0);
      expect(kpis.income.seriesMinor).toEqual([0, 0, 0, 520_000, 0, 0]);
      expect(whereItWent.map((g) => g.spentMinor)).toEqual([2_500]);
    });

    it('totals the current year and the five before it', async () => {
      const { kpis, whereItWent } = await load('year');
      expect(kpis.spent.currentMinor).toBe(33_799);
      expect(kpis.spent.seriesMinor).toEqual([0, 0, 0, 0, 0, 33_799]);
      expect(kpis.income.seriesMinor).toEqual([0, 0, 0, 0, 0, 1_040_000]);
      expect(whereItWent.reduce((total, g) => total + g.spentMinor, 0)).toBe(33_799);
    });

    it('charts the monthly recurring total for six months, counting a charge until it stopped', async () => {
      const { kpis } = await load();
      expect(kpis.recurring.seriesMinor).toEqual([5_599, 1_599, 1_599, 1_599, 1_599, 1_599]);
    });

    it('gives six months of income and the next expected deposit', async () => {
      const { kpis } = await load();
      expect(kpis.income.currentMinor).toBe(520_000);
      expect(kpis.income.seriesMinor).toEqual([0, 0, 0, 0, 520_000, 520_000]);
      expect(kpis.income.nextDeposit).toEqual({
        date: '2026-09-15T00:00:00.000Z',
        amountMinor: 520_000,
        merchantName: 'ACME PAYROLL',
      });
    });

    it('totals active recurring charges per month and counts candidates', async () => {
      const { kpis } = await load();
      expect(kpis.recurring).toMatchObject({ monthlyMinor: 1_599, count: 1, candidateCount: 0 });
    });

    it('divides what is spendable before payday by the days left', async () => {
      // burn = 23 799 / 30 = 793/day; payday in 17 days; 300 000 - 793 * 17 = 286 519;
      // (286 519 - 100 000 floor) / 17 = 10 971.7
      expect((await load()).kpis.safeToSpendPerDayMinor).toBe(10_971);
    });

    it('withholds safe-to-spend when there is no payday', async () => {
      await handle.db.delete(schema.incomeSources);
      const d = await load();
      expect(d.kpis.safeToSpendPerDayMinor).toBeNull();
      expect(d.runwaySeries).toBeNull();
    });

    it('lists the next recurring charges by date, with display names', async () => {
      expect((await load()).upcomingRecurring).toEqual([
        { merchantName: 'NETFLIX.COM', date: '2026-09-15', amountMinor: 1_599 },
      ]);
    });

    it('projects the balance day by day from today to payday', async () => {
      const series = (await load()).runwaySeries;
      expect(series?.floorMinor).toBe(100_000);
      expect(series?.points).toHaveLength(18);
      expect(series?.points[0]).toEqual({ date: '2026-08-29', balanceMinor: 300_000 });
      expect(series?.points[17]).toEqual({ date: '2026-09-15', balanceMinor: 286_519 });
    });

    it('rolls the last 30 days of spending up to top-level groups', async () => {
      expect((await load()).whereItWent).toEqual([
        { groupId: 'housing', name: 'Housing', spentMinor: 12_000 },
        { groupId: 'food', name: 'Food', spentMinor: 10_200 },
        { groupId: 'subscriptions', name: 'Subscriptions', spentMinor: 1_599 },
      ]);
    });
  });

  describe('transactions', () => {
    type Rows = { rows: Array<{ id: string; categorySource: string | null; needsReview: boolean }>; totalCount: number };
    const query = async (extra: object): Promise<Rows> =>
      (await services.queryTransactions({ limit: 50, offset: 0, ...extra })) as Rows;

    it('says who set each category', async () => {
      const { rows } = await query({});
      const source = Object.fromEntries(rows.map((r) => [r.id, r.categorySource]));
      expect(source['txn_1']).toBe('rule');
      expect(source['txn_3']).toBe('user');
      expect(source['txn_2']).toBe('model');
      expect(source['txn_5']).toBe('local_history');
    });

    it('names the account each transaction sits in', async () => {
      const { rows } = (await query({})) as unknown as { rows: Array<{ accountName: string; accountMask: string | null }> };
      expect(rows[0]).toMatchObject({ accountName: 'Everyday Checking', accountMask: '4321' });
    });

    it('filters to one account', async () => {
      expect((await query({ accountIds: ['acct_2'] })).totalCount).toBe(0);
      expect((await query({ accountIds: ['acct_1'] })).totalCount).toBe(7);
    });

    it('filters to transactions that need review', async () => {
      const result = await query({ needsReviewOnly: true });
      expect(result.rows.map((r) => r.id)).toEqual(['txn_2']);
    });

    it('treats a top-level category as all of its subcategories', async () => {
      const result = await query({ categoryIds: ['food'] });
      expect(result.rows.map((r) => r.id).sort()).toEqual(['txn_1', 'txn_2', 'txn_j1']);
    });
  });

  it('suggests the model guess, then the two most-used other categories at the merchant', async () => {
    const queue = (await services.reviewQueue({ limit: 10, offset: 0 })) as {
      rows: Array<{
        suggestions: Array<{ categoryId: string; name: string }>;
        transaction: { categorySource: string | null };
      }>;
    };
    expect(queue.rows[0]?.suggestions).toEqual([
      { categoryId: 'groceries', name: 'Groceries' },
      { categoryId: 'shopping', name: 'Shopping' },
      { categoryId: 'dining', name: 'Dining & Takeout' },
    ]);
    expect(queue.rows[0]?.transaction.categorySource).toBe('model');
  });

  it('describes each recurring charge with its next date and yearly cost', async () => {
    const rows = (await services.listRecurring()) as Array<{
      id: string;
      nextExpectedDate: string;
      monthlyCostMinor: number;
      yearlyCostMinor: number;
      status: string;
    }>;
    const netflix = rows.find((r) => r.id === 'rc_1');
    expect(netflix).toMatchObject({
      nextExpectedDate: '2026-09-15',
      monthlyCostMinor: 1_599,
      yearlyCostMinor: 19_188,
      status: 'active',
    });
    expect(rows.find((r) => r.id === 'rc_2')?.status).toBe('inactive');
  });

  it('names the account on each review item', async () => {
    const queue = (await services.reviewQueue({ limit: 10, offset: 0 })) as {
      rows: Array<{ transaction: { accountName: string; accountMask: string | null } }>;
    };
    expect(queue.rows[0]?.transaction).toMatchObject({ accountName: 'Everyday Checking', accountMask: '4321' });
  });

  it('says which transaction raised each alert, with its merchant and amount', async () => {
    await handle.db.insert(schema.alertRules).values({ id: 'rule_1', type: 'large_purchase', thresholdMinor: 5_000, windowMinutes: null, enabled: true });
    await handle.db.insert(schema.alerts).values({
      id: 'alert_1', ruleId: 'rule_1', triggeredByTransactionId: 'txn_3', eventOccurredAt: '2026-08-01T14:00:00Z',
      detectedAt: '2026-08-01T14:00:00Z', deliveredAt: null, dismissedAsFalsePositive: false, dedupeKey: 'large_purchase:txn_3',
    });
    const [alert] = (await services.listAlerts()) as Array<object>;
    expect(alert).toMatchObject({ transactionId: 'txn_3', merchantName: 'RENT', amountMinor: -12_000 });
  });

  describe('income', () => {
    it('names the account the deposit lands in', async () => {
      const rows = (await services.listIncome()) as Array<{ accountName: string; accountMask: string | null }>;
      expect(rows[0]).toMatchObject({ accountName: 'Everyday Checking', accountMask: '4321' });
    });

    it('counts the days until the next deposit', async () => {
      const rows = (await services.listIncome()) as Array<{ daysUntilNext: number | null }>;
      expect(rows[0]?.daysUntilNext).toBe(17);
    });

    it('gives income and spending for each of the last six months', async () => {
      const history = (await services.incomeHistory()) as Array<{
        month: string;
        incomeMinor: number;
        spendingMinor: number;
      }>;
      expect(history).toEqual([
        { month: '2026-03', incomeMinor: 0, spendingMinor: 0 },
        { month: '2026-04', incomeMinor: 0, spendingMinor: 0 },
        { month: '2026-05', incomeMinor: 0, spendingMinor: 0 },
        { month: '2026-06', incomeMinor: 0, spendingMinor: 0 },
        { month: '2026-07', incomeMinor: 520_000, spendingMinor: 10_000 },
        { month: '2026-08', incomeMinor: 520_000, spendingMinor: 23_799 },
      ]);
    });
  });

  describe('reports', () => {
    it('writes a plain headline and a daily series for each report', async () => {
      const list = (await services.listReports()) as Array<{
        id: string;
        headline: string;
        series: number[];
      }>;
      const july = list.find((r) => r.id === 'rep_jul');
      // Average of the other monthly report (June) is 300 000.
      expect(july?.headline).toBe('You spent $4,120, 37% above your average');
      expect(july?.series).toHaveLength(31);
      expect(july?.series[9]).toBe(10_000);
      expect(july?.series.reduce((a, b) => a + b, 0)).toBe(10_000);
    });

    it('summarises a report: biggest category, biggest purchase, price changes in the period', async () => {
      const made = (await services.generateReport({ type: 'monthly_report', asOf: '2026-08-15T00:00:00Z' })) as { id: string };
      const list = (await services.listReports()) as Array<{ id: string; summary: string }>;
      expect(list.find((r) => r.id === made.id)?.summary).toBe(
        'Rent & Mortgage was 50% of it. RENT ($120) was the largest single purchase.',
      );
      expect(list.find((r) => r.id === 'rep_jun')?.summary).toBe('NETFLIX.COM went up $3 in June.');
      expect(list.find((r) => r.id === 'rep_jul')?.summary).toBe('');
    });

    it('lists the largest purchases by merchant, with the date', async () => {
      const made = (await services.generateReport({
        type: 'monthly_report',
        asOf: '2026-08-15T00:00:00Z',
      })) as { id: string };
      const report = (await services.getReport(made.id)) as {
        content: { largestPurchases: Array<Record<string, unknown>> };
      };
      expect(report.content.largestPurchases[0]).toMatchObject({
        merchantName: 'RENT',
        postedDate: '2026-08-01',
        amountMinor: -12_000,
      });
    });

    it('names recurring charges by display name, not by merchant key', async () => {
      await services.renameMerchant({ merchantKey: 'netflix', displayName: 'Netflix Family' });
      const made = (await services.generateReport({
        type: 'monthly_report',
        asOf: '2026-08-15T00:00:00Z',
      })) as { id: string };
      const report = (await services.getReport(made.id)) as {
        content: { recurringAudit: Array<{ merchantName: string }> };
      };
      expect(report.content.recurringAudit.map((r) => r.merchantName)).toContain('Netflix Family');
    });

    it('gives the last periods in, out, saved and savings rate', async () => {
      const made = (await services.generateReport({
        type: 'monthly_report',
        asOf: '2026-08-15T00:00:00Z',
      })) as { id: string };
      const report = (await services.getReport(made.id)) as {
        kpiSeries: Array<{ periodStart: string; totalIncomeMinor: number; totalSpendingMinor: number }>;
      };
      expect(report.kpiSeries.map((k) => k.periodStart.slice(0, 7))).toEqual(['2026-06', '2026-07', '2026-08']);
      expect(report.kpiSeries[2]).toMatchObject({ totalIncomeMinor: 520_000, totalSpendingMinor: -23_799 });
    });

    it('prints the report to the chosen file', async () => {
      savePath.value = join(dir, 'out.pdf');
      const result = await services.exportReportPdf({ id: 'rep_jul' });
      expect(result).toEqual({ ok: true, path: savePath.value });
      expect(readFileSync(savePath.value, 'utf8')).toBe('%PDF-fake');
      expect(printed).toBe(1);
      expect((saveDialogOptions.value as { defaultPath: string }).defaultPath).toMatch(
        /Money report 2026-07\.pdf$/,
      );
    });
  });

  describe('health', () => {
    it('reports categorization, encryption, version and sync history', async () => {
      const h = (await services.health()) as {
        categorization: { provider: string; model: string | null };
        encryption: { databaseEncrypted: boolean; keysInKeychain: boolean };
        updates: { version: string };
        syncHistory: Array<{ at: string; ok: boolean; durationMs: number | null }>;
      };
      expect(h.categorization).toMatchObject({ provider: 'ollama', model: 'qwen3' });
      expect(h.encryption).toEqual({ databaseEncrypted: true, keysInKeychain: true });
      expect(h.updates).toEqual({ version: '1.2.3' });
      expect(h.syncHistory).toEqual([
        { at: '2026-08-29T11:00:00Z', ok: true, durationMs: 412 },
        { at: '2026-08-29T10:00:00Z', ok: false, durationMs: 30_000 },
      ]);
    });
  });

  it('gives each category what it spent this month, alone and with its subcategories', async () => {
    const rows = (await services.listCategories()) as Array<{
      id: string;
      spentMinor: number;
      rolledUpSpentMinor: number;
    }>;
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId['dining']?.spentMinor).toBe(6_400);
    expect(byId['food']?.spentMinor).toBe(0);
    expect(byId['food']?.rolledUpSpentMinor).toBe(10_200);
    expect(byId['groceries']?.spentMinor).toBe(3_800);
  });

  it('records when the last backup finished', async () => {
    expect(((await services.getSettings()) as { lastBackupAt: string | null }).lastBackupAt).toBeNull();
    mkdirSync(join(dir, 'backup'));
    await services.exportData(join(dir, 'backup'), 'correct horse battery');
    expect(((await services.getSettings()) as { lastBackupAt: string | null }).lastBackupAt).toBe(
      NOW.toISOString(),
    );
  });

  describe('setup: detect Ollama', () => {
    it('reports the version and the models when Ollama answers', async () => {
      vi.stubGlobal('fetch', async (url: string) =>
        new Response(
          url.endsWith('/api/version')
            ? JSON.stringify({ version: '0.5.1' })
            : JSON.stringify({ models: [{ name: 'qwen3:8b', size: 1 }] }),
        ),
      );
      expect(await services.detectOllama()).toEqual({ running: true, version: '0.5.1', models: ['qwen3:8b'] });
    });

    it('reports not running when nothing answers', async () => {
      vi.stubGlobal('fetch', async () => {
        throw new Error('ECONNREFUSED');
      });
      expect(await services.detectOllama()).toEqual({ running: false, models: [] });
    });
  });
});
