import { EMPTY_SYNC } from '@main/sync/outcome';
import type { ModelDescription } from '@main/services/index';
import type { HealthContents } from '@shared/types';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
  dialog: {
    showSaveDialog: async () => ({ canceled: true }),
    showOpenDialog: async () => ({ canceled: true }),
  },
  shell: { openExternal: async () => {} },
}));

const { openDatabase } = await import('@main/db/client');
const { runMigrations } = await import('@main/db/migrate');
const { Services } = await import('@main/services/index');
const { defaultCategories } = await import('@main/db/seed-categories');
const schema = await import('@main/db/schema');
const { Keyring } = await import('@main/secrets/keyring');
const { DiagnosticLogger } = await import('@main/diagnostics/logger');
const { MemorySink } = await import('@main/diagnostics/sink');
const { CategorizationPipeline } = await import('@main/categorization/pipeline');
const { TestClock } = await import('@shared/clock');
import type { OpenedSecret, SecretBackend } from '@main/secrets/backend';
import type { DatabaseHandle } from '@main/db/client';

class TestBackend implements SecretBackend {
  async isEncryptionAvailable(): Promise<boolean> {
    return true;
  }
  async encryptString(p: string): Promise<Buffer> {
    return Buffer.from(Buffer.from(p, 'utf8').toString('base64'), 'utf8');
  }
  async decryptString(c: Buffer): Promise<OpenedSecret> {
    return { value: Buffer.from(c.toString('utf8'), 'base64').toString('utf8'), shouldReEncrypt: false };
  }
}

const MIGRATIONS = join(process.cwd(), 'src/main/db/migrations');
const NOW = new Date('2026-08-29T12:00:00Z');
const RANGE = { periodStart: '2026-08-01T00:00:00Z', periodEnd: '2026-09-01T00:00:00Z' };

describe('Services with realistic data', () => {
  let dir: string;
  let handle: DatabaseHandle;
  let services: InstanceType<typeof Services>;
  let modelDescription: ModelDescription;
  let classify: () => Promise<{ categoryId: string; confidence: number; reasoning: string }>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'money-data-'));
    handle = await openDatabase(dir, new TestBackend());
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
    await db.insert(schema.accounts).values({
      id: 'acct_1',
      institutionId: 'inst_1',
      plaidAccountId: 'pa_1',
      name: 'Everyday Checking',
      mask: '4321',
      type: 'depository',
      subtype: 'checking',
      currentBalanceMinor: 84_700,
      balanceAsOf: '2026-08-29T11:00:00Z',
      isEveryday: true,
    });

    const txs = [
      ['txn_1', -6_400, 'uber eats', 'UBER EATS', '2026-08-05', 'dining'],
      ['txn_2', -3_800, 'target', 'TARGET 00023415', '2026-08-09', 'groceries'],
      ['txn_3', -12_000, 'landlord', 'RENT', '2026-08-01', 'rent'],
      ['txn_4', 520_000, 'acme-payroll', 'ACME PAYROLL', '2026-08-15', 'income'],
      ['txn_5', -1_599, 'netflix', 'NETFLIX.COM', '2026-08-15', 'streaming'],
    ] as const;

    for (const [id, amountMinor, merchantKey, description, postedDate, categoryId] of txs) {
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
        originalCurrency: id === 'txn_2' ? 'EUR' : null,
        originalAmountMinor: id === 'txn_2' ? 3_200 : null,
        firstSeenAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      });
      await db.insert(schema.categorizations).values({
        id: `cat_${id}`,
        transactionId: id,
        categoryId,
        confidence: id === 'txn_2' ? 0.6 : 0.95,
        source: 'model',
        isConfirmed: false,
        needsReview: id === 'txn_2',
        reasoning: id === 'txn_2' ? 'mixed-use merchant' : null,
        supersededBy: null,
        createdAt: NOW.toISOString(),
      });
    }

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
    await db.insert(schema.recurringCharges).values({
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
    });
    await db.insert(schema.recurringChargeAmountChanges).values({
      id: 'ac_1',
      recurringChargeId: 'rc_1',
      oldAmountMinor: -1_299,
      newAmountMinor: -1_599,
      changedAt: '2026-06-15T00:00:00Z',
    });
    await db.insert(schema.alertRules).values({
      id: 'rule_1',
      type: 'large_purchase',
      thresholdMinor: 20_000,
      windowMinutes: null,
      enabled: true,
    });
    await db.insert(schema.alerts).values({
      id: 'alert_1',
      ruleId: 'rule_1',
      triggeredByTransactionId: 'txn_3',
      eventOccurredAt: '2026-08-01T14:00:00Z',
      detectedAt: '2026-08-29T11:00:00Z',
      deliveredAt: null,
      dismissedAsFalsePositive: false,
      dedupeKey: 'large_purchase:txn_3',
    });
    await db.insert(schema.periodReports).values({
      id: 'rep_1',
      type: 'monthly_report',
      periodStart: '2026-07-01T00:00:00Z',
      periodEnd: '2026-08-01T00:00:00Z',
      content: JSON.stringify({ totalSpendingMinor: -412_000, savingsRate: 0.18 }),
      generatedAt: NOW.toISOString(),
      deliveredAt: null,
      wasLate: false,
      dataComplete: true,
    });
    await db.insert(schema.diagnosticEvents).values([
      {
        occurredAt: '2026-08-29T11:00:00Z',
        eventType: 'sync_attempt',
        outcome: 'success',
        subjectId: 'inst_1',
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
    ]);

    classify = async () => ({ categoryId: 'dining', confidence: 0.9, reasoning: '' });
    modelDescription = {
      provider: 'local_only',
      model: null,
      localOnly: true,
      reason: 'History only in tests',
    };

    services = new Services({
      handle,
      userDataDir: dir,
      clock: new TestClock(NOW),
      logger: new DiagnosticLogger(new MemorySink(), new TestClock(NOW)),
      keyring: new Keyring(new TestBackend()),
      pipeline: new CategorizationPipeline(
        { classify: async () => ({ categoryId: 'dining', confidence: 0.9, reasoning: '' }) },
        { confidenceThreshold: 0.8 },
      ),
      sync: async () => EMPTY_SYNC,
      buildPipeline: () =>
        Promise.resolve(
          new CategorizationPipeline({ classify: () => classify() }, { confidenceThreshold: 0.8 }),
        ),
      describeModel: () => Promise.resolve(modelDescription),
    });
  });

  afterEach(() => {
    handle.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists each account individually under its institution', async () => {
    const rows = (await services.listInstitutions()) as Array<{
      accounts: Array<{ id: string; name: string; isEveryday: boolean }>;
    }>;
    expect(rows[0]?.accounts).toHaveLength(1);
    expect(rows[0]?.accounts[0]?.name).toBe('Everyday Checking');
  });

  it('excludes a non-everyday account from spending totals', async () => {
    const before = (await services.dashboard(RANGE)) as {
      cashFlowMinor: { spendingMinor: number };
    };
    expect(before.cashFlowMinor.spendingMinor).toBeLessThan(0);

    await services.setAccountEveryday({ accountId: 'acct_1', isEveryday: false });

    const after = (await services.dashboard(RANGE)) as {
      cashFlowMinor: { spendingMinor: number; incomeMinor: number };
      categoryBreakdown: { totalMinor: number };
    };
    // Every transaction lives on that account, so day-to-day goes to zero.
    expect(after.cashFlowMinor.spendingMinor).toBe(0);
    expect(after.cashFlowMinor.incomeMinor).toBe(0);
    expect(after.categoryBreakdown.totalMinor).toBe(0);
  });

  it('excludes a non-everyday balance from the runway', async () => {
    await services.setAccountEveryday({ accountId: 'acct_1', isEveryday: false });
    const d = (await services.dashboard(RANGE)) as {
      runway: { currentBalanceMinor: number };
    };
    expect(d.runway.currentBalanceMinor).toBe(0);
  });

  it('the transaction register still shows excluded accounts', async () => {
    await services.setAccountEveryday({ accountId: 'acct_1', isEveryday: false });
    const q = (await services.queryTransactions({ limit: 50, offset: 0 })) as {
      totalCount: number;
    };
    // Excluded from totals, not hidden from the log.
    expect(q.totalCount).toBeGreaterThan(0);
  });

  it('names recurring charges by their display name, not the merchant key', async () => {
    await services.updateTransaction({
      transactionId: 'txn_5',
      userMerchantName: 'Netflix Family',
    });
    await services.refreshAnalysis();
    const rows = (await services.listRecurring()) as Array<{
      merchantKey: string;
      merchantName: string;
    }>;
    const netflix = rows.find((r) => r.merchantKey === 'netflix');
    expect(netflix?.merchantName).toBe('Netflix Family');
  });

  it('falls back to the bank name when there is no override', async () => {
    await services.refreshAnalysis();
    const income = (await services.listIncome()) as Array<{
      merchantKey: string;
      merchantName: string;
    }>;
    const acme = income.find((i) => i.merchantKey === 'acme-payroll');
    // The bank descriptor, never the normalized key.
    expect(acme?.merchantName).toBe('ACME PAYROLL');
  });

  it('reports data as complete when the feed is fresh', async () => {
    expect((await services.completeness()).dataComplete).toBe(true);
  });

  it('separates income from spending in cash flow', async () => {
    const d = (await services.dashboard(RANGE)) as {
      cashFlowMinor: { incomeMinor: number; spendingMinor: number; netMinor: number };
    };
    expect(d.cashFlowMinor.incomeMinor).toBe(520_000);
    expect(d.cashFlowMinor.spendingMinor).toBe(-(6_400 + 3_800 + 12_000 + 1_599));
    expect(d.cashFlowMinor.netMinor).toBe(520_000 - 23_799);
  });

  it('projects the runway when confirmed income exists', async () => {
    const d = (await services.dashboard(RANGE)) as {
      runway: { available: boolean; projectedMinor: number | null; nextIncomeDate: string | null };
    };
    expect(d.runway.available).toBe(true);
    expect(d.runway.projectedMinor).not.toBeNull();
    expect(d.runway.nextIncomeDate).toContain('2026-09-15');
  });

  it('breaks down by category with human names and reconciles exactly (SC-004)', async () => {
    const b = (await services.breakdownByCategory(RANGE)) as {
      rows: Array<{ name: string; totalMinor: number }>;
      totalMinor: number;
    };
    expect(b.rows.reduce((a, r) => a + r.totalMinor, 0)).toBe(b.totalMinor);
    expect(b.rows.some((r) => r.name === 'Dining & Takeout')).toBe(true);
  });

  it('breaks down by merchant', async () => {
    const b = (await services.breakdownByMerchant(RANGE)) as { rows: Array<{ categoryId: string }> };
    expect(b.rows.map((r) => r.categoryId)).toContain('uber eats');
  });

  it('returns transactions with their live category and FX metadata', async () => {
    const q = (await services.queryTransactions({
      limit: 50,
      offset: 0,
      confirmationStatus: 'all',
    })) as { rows: Array<{ id: string; categoryId: string; originalCurrency: string | null }> };
    expect(q.rows.find((r) => r.id === 'txn_1')?.categoryId).toBe('dining');
    expect(q.rows.find((r) => r.id === 'txn_2')?.originalCurrency).toBe('EUR');
  });

  it('shows income in the transaction log alongside spending', async () => {
    const q = (await services.queryTransactions({
      limit: 50,
      offset: 0,
      direction: 'all',
    })) as { rows: Array<{ id: string; amountMinor: number }> };
    const income = q.rows.find((r) => r.id === 'txn_4');
    expect(income, 'income must appear in the register').toBeDefined();
    expect(income?.amountMinor).toBe(520_000);
  });

  it('returns transactions newest first, so recent activity is never buried', async () => {
    const q = (await services.queryTransactions({ limit: 50, offset: 0 })) as {
      rows: Array<{ postedDate: string }>;
    };
    const dates = q.rows.map((r) => r.postedDate);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });

  it('filters to money in', async () => {
    const q = (await services.queryTransactions({
      limit: 50,
      offset: 0,
      direction: 'in',
    })) as { rows: Array<{ amountMinor: number }>; totalCount: number };
    expect(q.totalCount).toBe(1);
    expect(q.rows.every((r) => r.amountMinor > 0)).toBe(true);
  });

  it('filters to money out', async () => {
    const q = (await services.queryTransactions({
      limit: 50,
      offset: 0,
      direction: 'out',
    })) as { rows: Array<{ amountMinor: number }> };
    expect(q.rows.every((r) => r.amountMinor < 0)).toBe(true);
    expect(q.rows.length).toBe(4);
  });

  it('filters by amount range on magnitude, so it works for income too', async () => {
    const q = (await services.queryTransactions({
      limit: 50,
      offset: 0,
      // $100 and up: catches rent (-$120) and the paycheck (+$5,200), and
      // excludes the small purchases.
      minAmountMinor: 10_000,
    })) as { rows: Array<{ id: string }> };
    const ids = q.rows.map((r) => r.id);
    expect(ids).toContain('txn_4');
    expect(ids).toContain('txn_3');
    expect(ids).not.toContain('txn_5');
  });

  it('searches a user-applied rename as well as the imported name', async () => {
    await services.updateTransaction({
      transactionId: 'txn_1',
      userMerchantName: 'Late night food',
    });
    const q = (await services.queryTransactions({
      limit: 50,
      offset: 0,
      merchantKey: 'late night',
    })) as { totalCount: number };
    expect(q.totalCount).toBe(1);
  });

  it('filters transactions by category and by merchant search', async () => {
    const byCategory = (await services.queryTransactions({
      categoryIds: ['dining'],
      limit: 50,
      offset: 0,
    })) as { totalCount: number };
    expect(byCategory.totalCount).toBe(1);

    const bySearch = (await services.queryTransactions({
      merchantKey: 'netflix',
      limit: 50,
      offset: 0,
    })) as { totalCount: number };
    expect(bySearch.totalCount).toBe(1);
  });

  it('builds a spending trend with a prior average', async () => {
    const trend = (await services.trends(RANGE)) as {
      series: Array<{ label: string }>;
      priorAverageMinor: number | null;
    };
    expect(trend.series[0]?.label).toBe('2026-08');
    expect(trend.priorAverageMinor).toBeGreaterThan(0);
  });

  it('surfaces only the flagged transaction in the review queue, with its reasoning', async () => {
    const q = (await services.reviewQueue({ limit: 10, offset: 0 })) as {
      rows: Array<{ reasoning: string | null; transaction: { id: string } }>;
      totalCount: number;
    };
    expect(q.totalCount).toBe(1);
    expect(q.rows[0]?.transaction.id).toBe('txn_2');
    expect(q.rows[0]?.reasoning).toBe('mixed-use merchant');
  });

  it('recategorizes and reports the retroactive candidate count without applying it (FR-074)', async () => {
    const r = (await services.recategorize({
      transactionIds: ['txn_2'],
      categoryId: 'home',
    })) as { updated: number; retroactiveCandidateCount: number };
    expect(r.updated).toBe(1);
    expect(r.retroactiveCandidateCount).toBe(0);

    const q = (await services.queryTransactions({ limit: 50, offset: 0 })) as {
      rows: Array<{ id: string; categoryId: string }>;
    };
    expect(q.rows.find((x) => x.id === 'txn_2')?.categoryId).toBe('home');
  });

  it('never overwrites a prior manual correction on a retroactive pass (FR-076)', async () => {
    await services.recategorize({ transactionIds: ['txn_2'], categoryId: 'home' });
    const r = (await services.applyRetroactive({
      merchantKey: 'target',
      categoryId: 'clothing',
    })) as { updated: number; skippedUserConfirmed: number };
    expect(r.skippedUserConfirmed).toBe(1);
    expect(r.updated).toBe(0);
  });

  it('dismisses a flag without changing the category', async () => {
    await services.dismissFlags(['txn_2']);
    const q = (await services.reviewQueue({ limit: 10, offset: 0 })) as { totalCount: number };
    expect(q.totalCount).toBe(0);
  });

  it('reports usage and whether deletion needs a destination', async () => {
    const cats = (await services.listCategories()) as Array<{
      id: string;
      usageCount: number;
      needsReassignment: boolean;
    }>;
    expect(cats.find((c) => c.id === 'dining')?.usageCount).toBe(1);
    // In use, so deleting it requires saying where its transactions go.
    expect(cats.find((c) => c.id === 'dining')?.needsReassignment).toBe(true);
  });

  it('deletes an unused category with no prompt', async () => {
    const created = (await services.createCategory({ name: 'Scratch', parentId: null })) as {
      id: string;
    };
    await services.deleteCategory({ id: created.id });
    const cats = (await services.listCategories()) as Array<{ id: string }>;
    expect(cats.some((c) => c.id === created.id)).toBe(false);
  });

  it('refuses to delete a category still in use, and says how many use it', async () => {
    const created = (await services.createCategory({ name: 'InUse', parentId: null })) as {
      id: string;
    };
    await services.updateTransaction({ transactionId: 'txn_1', categoryId: created.id });
    await expect(services.deleteCategory({ id: created.id })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringContaining('1 transaction'),
    });
  });

  it('deletes a built-in category once its transactions have somewhere to go', async () => {
    const result = (await services.deleteCategory({
      id: 'dining',
      reassignToId: 'groceries',
    })) as { movedTransactions: number };
    expect(result.movedTransactions).toBe(1);
    const cats = (await services.listCategories()) as Array<{ id: string }>;
    expect(cats.some((c) => c.id === 'dining')).toBe(false);
  });

  it('moves the transactions rather than orphaning them', async () => {
    await services.deleteCategory({ id: 'dining', reassignToId: 'groceries' });
    const q = (await services.queryTransactions({ limit: 50, offset: 0 })) as {
      rows: Array<{ id: string; categoryId: string }>;
    };
    expect(q.rows.find((r) => r.id === 'txn_1')?.categoryId).toBe('groceries');
  });

  it('keeps totals reconciling after a delete-and-move', async () => {
    const before = (await services.breakdownByCategory(RANGE)) as { totalMinor: number };
    await services.deleteCategory({ id: 'dining', reassignToId: 'groceries' });
    const after = (await services.breakdownByCategory(RANGE)) as {
      rows: Array<{ totalMinor: number }>;
      totalMinor: number;
    };
    expect(after.totalMinor).toBe(before.totalMinor);
    expect(after.rows.reduce((a, r) => a + r.totalMinor, 0)).toBe(after.totalMinor);
  });

  it('prompts for a destination when the category is in use', async () => {
    await expect(services.deleteCategory({ id: 'dining' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringContaining('1 transaction'),
    });
  });

  it('rejects moving a category into itself', async () => {
    await expect(
      services.deleteCategory({ id: 'dining', reassignToId: 'dining' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects a destination that does not exist', async () => {
    await expect(
      services.deleteCategory({ id: 'dining', reassignToId: 'nope' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('asks where subcategories should go before deleting their parent', async () => {
    const parent = (await services.createCategory({ name: 'Parent', parentId: null })) as {
      id: string;
    };
    await services.createCategory({ name: 'Child', parentId: parent.id });
    await expect(services.deleteCategory({ id: parent.id })).rejects.toMatchObject({
      message: expect.stringContaining('orphaned'),
    });
  });

  it('re-parents subcategories when the parent is deleted with a destination', async () => {
    const parent = (await services.createCategory({ name: 'Parent', parentId: null })) as {
      id: string;
    };
    const child = (await services.createCategory({ name: 'Child', parentId: parent.id })) as {
      id: string;
    };
    await services.deleteCategory({ id: parent.id, reassignToId: 'housing' });
    const cats = (await services.listCategories()) as Array<{ id: string; parentId: string | null }>;
    expect(cats.find((c) => c.id === child.id)?.parentId).toBe('housing');
  });

  it('reports a missing category honestly', async () => {
    await expect(services.deleteCategory({ id: 'nope' })).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('rolls the dashboard breakdown up to parents', async () => {
    const d = (await services.dashboard(RANGE)) as {
      categoryBreakdown: {
        rows: Array<{ categoryId: string; parentId: string | null; parentName: string | null }>;
      };
    };
    const dining = d.categoryBreakdown.rows.find((r) => r.categoryId === 'dining');
    expect(dining?.parentId).toBe('food');
    expect(dining?.parentName).toBe('Food');
  });

  it('populates the recurring ledger from stored transactions', async () => {
    // Twelve monthly Netflix charges already in the database.
    for (let i = 0; i < 12; i += 1) {
      const date = new Date(Date.UTC(2025, 8 + i, 15));
      await handle.db.insert(schema.transactions).values({
        id: `txn_nf_${i}`,
        accountId: 'acct_1',
        plaidTransactionId: `p_nf_${i}`,
        amountMinor: -1599,
        merchantName: 'Netflix',
        merchantKey: 'netflix-auto',
        description: 'NETFLIX.COM',
        postedDate: date.toISOString().slice(0, 10),
        datetime: date.toISOString(),
        pending: false,
        settlementState: 'posted',
        isInternalTransfer: false,
        reversesTransactionId: null,
        originalCurrency: null,
        originalAmountMinor: null,
        userMerchantName: null,
        userNote: null,
        userExcluded: false,
        userRecurringOverride: null,
        firstSeenAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      });
    }

    const before = (await services.listRecurring()) as unknown[];
    const result = (await services.refreshAnalysis()) as { recurringCount: number };
    const after = (await services.listRecurring()) as Array<{ merchantKey: string; cadence: string }>;

    expect(result.recurringCount).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(before.length);
    const netflix = after.find((r) => r.merchantKey === 'netflix-auto');
    expect(netflix?.cadence).toBe('monthly');
  });

  it('populates the income ledger from recurring deposits', async () => {
    for (let i = 0; i < 10; i += 1) {
      const date = new Date(Date.UTC(2026, 0, 2 + i * 14));
      await handle.db.insert(schema.transactions).values({
        id: `txn_pay_${i}`,
        accountId: 'acct_1',
        plaidTransactionId: `p_pay_${i}`,
        amountMinor: 260_000,
        merchantName: 'Acme Payroll',
        merchantKey: 'acme-auto',
        description: 'ACME PAYROLL',
        postedDate: date.toISOString().slice(0, 10),
        datetime: date.toISOString(),
        pending: false,
        settlementState: 'posted',
        isInternalTransfer: false,
        reversesTransactionId: null,
        originalCurrency: null,
        originalAmountMinor: null,
        userMerchantName: null,
        userNote: null,
        userExcluded: false,
        userRecurringOverride: null,
        firstSeenAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      });
    }

    await services.refreshAnalysis();
    const income = (await services.listIncome()) as Array<{ merchantKey: string; cadence: string }>;
    expect(income.some((i) => i.merchantKey === 'acme-auto' && i.cadence === 'biweekly')).toBe(true);
  });

  it('a rescan is idempotent — it does not duplicate ledger rows', async () => {
    await services.refreshAnalysis();
    const first = ((await services.listRecurring()) as unknown[]).length;
    await services.refreshAnalysis();
    expect(((await services.listRecurring()) as unknown[]).length).toBe(first);
  });

  it('respects a user marking a merchant not recurring', async () => {
    for (let i = 0; i < 12; i += 1) {
      const date = new Date(Date.UTC(2025, 8 + i, 20));
      await handle.db.insert(schema.transactions).values({
        id: `txn_gym_${i}`,
        accountId: 'acct_1',
        plaidTransactionId: `p_gym_${i}`,
        amountMinor: -4500,
        merchantName: 'Gym',
        merchantKey: 'gym-auto',
        description: 'GYM',
        postedDate: date.toISOString().slice(0, 10),
        datetime: date.toISOString(),
        pending: false,
        settlementState: 'posted',
        isInternalTransfer: false,
        reversesTransactionId: null,
        originalCurrency: null,
        originalAmountMinor: null,
        userMerchantName: null,
        userNote: null,
        userExcluded: true,
        userRecurringOverride: 'not_recurring',
        firstSeenAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      });
    }
    await services.refreshAnalysis();
    const rows = (await services.listRecurring()) as Array<{ merchantKey: string }>;
    expect(rows.some((r) => r.merchantKey === 'gym-auto')).toBe(false);
  });

  it('lists recurring charges with cumulative total and amount history', async () => {
    const rows = (await services.listRecurring()) as Array<{
      cumulativePaidMinor: number;
      amountChanges: unknown[];
    }>;
    expect(rows[0]?.cumulativePaidMinor).toBe(-12_792);
    expect(rows[0]?.amountChanges).toHaveLength(1);
  });

  it('acknowledges and deactivates a recurring charge', async () => {
    await services.acknowledgeRecurring('rc_1');
    await services.markNotRecurring('rc_1');
    const rows = (await services.listRecurring()) as Array<{ status: string }>;
    expect(rows[0]?.status).toBe('inactive');
  });

  it('lists income and honours confirm and clear', async () => {
    await services.clearIncomeOverride('inc_1');
    let rows = (await services.listIncome()) as Array<{ isUserConfirmed: boolean }>;
    expect(rows[0]?.isUserConfirmed).toBe(false);
    await services.confirmIncome('inc_1');
    rows = (await services.listIncome()) as Array<{ isUserConfirmed: boolean }>;
    expect(rows[0]?.isUserConfirmed).toBe(true);
  });

  it('overrides an income pattern', async () => {
    await services.overrideIncome({ id: 'inc_1', cadence: 'biweekly', expectedAmountMinor: 260_000 });
    const rows = (await services.listIncome()) as Array<{ cadence: string; expectedAmountMinor: number }>;
    expect(rows[0]?.cadence).toBe('biweekly');
    expect(rows[0]?.expectedAmountMinor).toBe(260_000);
  });

  it('lists alerts with both event and detection times (FR-057)', async () => {
    const rows = (await services.listAlerts()) as Array<{
      type: string;
      eventOccurredAt: string;
      detectedAt: string;
    }>;
    expect(rows[0]?.type).toBe('large_purchase');
    expect(rows[0]?.eventOccurredAt).not.toBe(rows[0]?.detectedAt);
  });

  it('dismisses an alert instance without touching the rule (FR-032)', async () => {
    await services.dismissAlert('alert_1');
    const alerts = (await services.listAlerts()) as Array<{ dismissed: boolean }>;
    const rules = (await services.listAlertRules()) as Array<{ enabled: boolean }>;
    expect(alerts[0]?.dismissed).toBe(true);
    expect(rules[0]?.enabled).toBe(true);
  });

  it('updates an alert rule threshold and enabled state (FR-033)', async () => {
    await services.updateAlertRule({ id: 'rule_1', thresholdMinor: 50_000, enabled: false });
    const rules = (await services.listAlertRules()) as Array<{ thresholdMinor: number; enabled: boolean }>;
    expect(rules[0]?.thresholdMinor).toBe(50_000);
    expect(rules[0]?.enabled).toBe(false);
  });

  it('lists and retrieves reports with parsed content', async () => {
    const list = (await services.listReports()) as Array<{ id: string; savingsRate: number }>;
    expect(list[0]?.savingsRate).toBeCloseTo(0.18, 2);
    const report = (await services.getReport('rep_1')) as { content: { totalSpendingMinor: number } };
    expect(report.content.totalSpendingMinor).toBe(-412_000);
  });

  it('reports health with per-account failures and real metrics', async () => {
    const h = (await services.health()) as {
      perAccount: Array<{ recentFailures: number; lastSuccessfulSync: string | null }>;
      metrics: { transactionsProcessed: number; syncDurationMsP50: number | null; localResolutionRate: number | null };
    };
    expect(h.perAccount[0]?.recentFailures).toBe(1);
    expect(h.metrics.transactionsProcessed).toBe(5);
    expect(h.metrics.syncDurationMsP50).not.toBeNull();
    expect(h.metrics.localResolutionRate).toBe(0);
  });

  it('cancelling the export dialog is not an error', async () => {
    expect(await services.exportDiagnostics('')).toMatchObject({ ok: false });
    expect(await services.exportData('')).toMatchObject({ ok: false });
    expect(await services.importData('')).toMatchObject({ ok: false });
  });

  it('sync:now delegates to the injected sync', async () => {
    expect(await services.syncNow()).toMatchObject({ added: 0, failures: [], message: 'Synced. Nothing new.' });
  });

  it('disconnecting an institution removes it', async () => {
    await services.disconnectInstitution('inst_1');
    expect((await services.listInstitutions()) as unknown[]).toHaveLength(0);
  });

  describe('user overrides on a transaction', () => {
    it('saves a rename, note, exclusion, and recurring override together', async () => {
      await services.updateTransaction({
        transactionId: 'txn_1',
        userMerchantName: 'Dinner with Sam',
        userNote: 'split with Sam, reimbursed',
        userExcluded: true,
        userRecurringOverride: 'not_recurring',
      });
      const q = (await services.queryTransactions({ limit: 50, offset: 0 })) as {
        rows: Array<{
          id: string;
          userMerchantName: string | null;
          userNote: string | null;
          userExcluded: boolean;
          userRecurringOverride: string | null;
        }>;
      };
      const row = q.rows.find((r) => r.id === 'txn_1');
      expect(row?.userMerchantName).toBe('Dinner with Sam');
      expect(row?.userNote).toBe('split with Sam, reimbursed');
      expect(row?.userExcluded).toBe(true);
      expect(row?.userRecurringOverride).toBe('not_recurring');
    });

    it('an excluded transaction drops out of spending totals', async () => {
      const before = (await services.dashboard(RANGE)) as {
        cashFlowMinor: { spendingMinor: number };
      };
      await services.updateTransaction({ transactionId: 'txn_1', userExcluded: true });
      const after = (await services.dashboard(RANGE)) as {
        cashFlowMinor: { spendingMinor: number };
      };
      // txn_1 was -6,400; excluding it makes spending less negative by exactly that.
      expect(after.cashFlowMinor.spendingMinor - before.cashFlowMinor.spendingMinor).toBe(6_400);
    });

    it('marking not-recurring deactivates the merchant recurring charge', async () => {
      await services.updateTransaction({
        transactionId: 'txn_5',
        userRecurringOverride: 'not_recurring',
      });
      const rows = (await services.listRecurring()) as Array<{ status: string }>;
      expect(rows[0]?.status).toBe('inactive');
    });

    it('remembers the category for the merchant and reports the retroactive count', async () => {
    const r = (await services.updateTransaction({
      transactionId: 'txn_1',
      categoryId: 'groceries',
    })) as { merchantKey: string | null; retroactiveCandidateCount: number };
    expect(r.merchantKey).toBe('uber eats');
    // Only txn_1 exists for this merchant and it is now already correct.
    expect(r.retroactiveCandidateCount).toBe(0);

    // The confirmation is persisted, so future imports default to it (FR-016).
    const profiles = await handle.db.select().from(schema.merchantProfiles);
    expect(profiles.find((x) => x.merchantKey === 'uber eats')?.userConfirmedCategoryId).toBe(
      'groceries',
    );
  });

  it('changes the category through the same call', async () => {
      await services.updateTransaction({ transactionId: 'txn_1', categoryId: 'groceries' });
      const q = (await services.queryTransactions({ limit: 50, offset: 0 })) as {
        rows: Array<{ id: string; categoryId: string }>;
      };
      expect(q.rows.find((r) => r.id === 'txn_1')?.categoryId).toBe('groceries');
    });

    it('clearing an override restores the imported value', async () => {
      await services.updateTransaction({ transactionId: 'txn_1', userMerchantName: 'Renamed' });
      await services.updateTransaction({ transactionId: 'txn_1', userMerchantName: null });
      const q = (await services.queryTransactions({ limit: 50, offset: 0 })) as {
        rows: Array<{ id: string; userMerchantName: string | null; description: string }>;
      };
      const row = q.rows.find((r) => r.id === 'txn_1');
      expect(row?.userMerchantName).toBeNull();
      // The imported descriptor was never mutated.
      expect(row?.description).toBe('UBER EATS');
    });
  });

  describe('alert rule management', () => {
    it('creates a second rule of a kind that already exists', async () => {
      const created = (await services.createAlertRule({
        type: 'large_purchase',
        thresholdMinor: 100_000,
        label: 'Very large',
      })) as { id: string };
      const rules = (await services.listAlertRules()) as Array<{ id: string; type: string }>;
      expect(rules.filter((r) => r.type === 'large_purchase')).toHaveLength(2);
      expect(rules.some((r) => r.id === created.id)).toBe(true);
    });

    it('edits a threshold and a label', async () => {
      await services.updateAlertRule({ id: 'rule_1', thresholdMinor: 55_000, label: 'Big spend' });
      const rules = (await services.listAlertRules()) as Array<{
        id: string;
        thresholdMinor: number;
        label: string | null;
      }>;
      const rule = rules.find((r) => r.id === 'rule_1');
      expect(rule?.thresholdMinor).toBe(55_000);
      expect(rule?.label).toBe('Big spend');
    });

    it('deletes a rule without deleting alerts it already raised', async () => {
      await services.deleteAlertRule('rule_1');
      expect(((await services.listAlertRules()) as unknown[]).length).toBe(0);
      // The alert history survives; only the rule stops firing.
      expect(((await services.listAlerts()) as unknown[]).length).toBe(1);
    });
  });

  describe('on-demand report generation', () => {
    it('generates a monthly report from real data', async () => {
      const r = (await services.generateReport({ type: 'monthly_report' })) as {
        id: string;
        content: { totalIncomeMinor: number; totalSpendingMinor: number };
      };
      expect(r.id).toBeDefined();
      expect(r.content.totalIncomeMinor).toBe(520_000);
      expect(r.content.totalSpendingMinor).toBeLessThan(0);
    });

    it('generates a weekly digest', async () => {
      const r = (await services.generateReport({
        type: 'weekly_digest',
        asOf: '2026-08-05T12:00:00Z',
      })) as { content: { hadActivity: boolean } };
      expect(r.content.hadActivity).toBeDefined();
    });

    it('generates a custom report over an arbitrary range', async () => {
      const r = (await services.generateReport({
        type: 'custom',
        periodStart: '2026-08-01T00:00:00Z',
        periodEnd: '2026-08-10T00:00:00Z',
        label: 'First ten days',
      })) as { id: string; content: { totalSpendingMinor: number } };
      expect(r.id).toBeDefined();
      const list = (await services.listReports()) as Array<{ type: string; label: string | null }>;
      expect(list.find((x) => x.type === 'custom')?.label).toBe('First ten days');
    });

    it('a custom range only includes transactions inside it', async () => {
      const narrow = (await services.generateReport({
        type: 'custom',
        periodStart: '2026-08-01T00:00:00Z',
        periodEnd: '2026-08-02T00:00:00Z',
      })) as { content: { totalSpendingMinor: number } };
      // Only rent (-12,000) falls on 2026-08-01.
      expect(narrow.content.totalSpendingMinor).toBe(-12_000);
    });

    it('rejects a range that ends before it starts', async () => {
      await expect(
        services.generateReport({
          type: 'custom',
          periodStart: '2026-08-10T00:00:00Z',
          periodEnd: '2026-08-01T00:00:00Z',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('rejects an unparseable date', async () => {
      await expect(
        services.generateReport({ type: 'custom', periodStart: 'nope', periodEnd: 'also nope' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('deletes a report', async () => {
      const r = (await services.generateReport({ type: 'monthly_report' })) as { id: string };
      await services.deleteReport(r.id);
      const list = (await services.listReports()) as Array<{ id: string }>;
      expect(list.some((x) => x.id === r.id)).toBe(false);
    });

    it('the generated report then appears in the list', async () => {
      await services.generateReport({ type: 'monthly_report' });
      const list = (await services.listReports()) as Array<{ type: string }>;
      expect(list.some((x) => x.type === 'monthly_report')).toBe(true);
    });
  });

  describe('testModel says plainly whether the model answers', () => {
    it('reports local-only mode as a configuration state, not a failure', async () => {
      const result = (await services.testModel()) as { ok: boolean; message: string };
      expect(result.ok).toBe(false);
      expect(result.message).toBe('History only in tests');
    });

    it('reports success when the model answers', async () => {
      modelDescription = { provider: 'anthropic', model: 'claude-haiku-4-5', localOnly: false, reason: '' };
      const result = (await services.testModel()) as { ok: boolean; message: string };
      expect(result.ok).toBe(true);
      expect(result.message).toContain('claude-haiku-4-5');
    });

    it('surfaces the raw error instead of degrading quietly', async () => {
      modelDescription = { provider: 'anthropic', model: 'claude-haiku-4-5', localOnly: false, reason: '' };
      classify = () => Promise.reject(new Error('401 invalid x-api-key'));
      const result = (await services.testModel()) as { ok: boolean; message: string };
      expect(result.ok).toBe(false);
      // The raw error survives; the actionable hint is appended to it.
      expect(result.message).toContain('401 invalid x-api-key');
      expect(result.message).toContain('check the API key');
    });
  });

  describe('recategorizePending sends unresolved transactions to the model', () => {
    it('does nothing but say why when no model is configured', async () => {
      const result = (await services.recategorizePending()) as { ok: boolean; changed: number };
      expect(result.ok).toBe(false);
      expect(result.changed).toBe(0);
    });

    it('replaces heuristic answers with model answers', async () => {
      modelDescription = { provider: 'anthropic', model: 'claude-haiku-4-5', localOnly: false, reason: '' };
      const before = (await services.reviewQueue({ limit: 200, offset: 0 })) as { rows: unknown[] };
      const result = (await services.recategorizePending()) as {
        ok: boolean;
        examined: number;
        changed: number;
      };
      expect(result.ok).toBe(true);
      expect(result.examined).toBeGreaterThan(0);
      expect(result.changed).toBe(result.examined);
      const after = (await services.reviewQueue({ limit: 200, offset: 0 })) as { rows: unknown[] };
      expect(after.rows.length).toBeLessThan(before.rows.length);
    });

    it('reports the model error rather than claiming success', async () => {
      modelDescription = { provider: 'anthropic', model: 'claude-haiku-4-5', localOnly: false, reason: '' };
      classify = () => Promise.reject(new Error('rate limited'));
      const result = (await services.recategorizePending()) as { ok: boolean; message: string };
      expect(result.ok).toBe(false);
      expect(result.message).toContain('rate limited');
    });
  });

  describe('syncNow refuses to report a failed run as a success', () => {
    it('throws when Plaid credentials are missing', async () => {
      const speaking = new Services({
        handle,
        userDataDir: dir,
        clock: new TestClock(NOW),
        logger: new DiagnosticLogger(new MemorySink(), new TestClock(NOW)),
        keyring: new Keyring(new TestBackend()),
        pipeline: new CategorizationPipeline({ classify: () => classify() }, { confidenceThreshold: 0.8 }),
        buildPipeline: () =>
          Promise.resolve(
            new CategorizationPipeline({ classify: () => classify() }, { confidenceThreshold: 0.8 }),
          ),
        describeModel: () => Promise.resolve(modelDescription),
        sync: async () => ({ ...EMPTY_SYNC, blocked: 'no_credentials' as const }),
      });
      await expect(speaking.syncNow()).rejects.toThrow(/credentials are missing/);
    });

    it('throws with the institution error when every institution failed', async () => {
      const failing = new Services({
        handle,
        userDataDir: dir,
        clock: new TestClock(NOW),
        logger: new DiagnosticLogger(new MemorySink(), new TestClock(NOW)),
        keyring: new Keyring(new TestBackend()),
        pipeline: new CategorizationPipeline({ classify: () => classify() }, { confidenceThreshold: 0.8 }),
        buildPipeline: () =>
          Promise.resolve(
            new CategorizationPipeline({ classify: () => classify() }, { confidenceThreshold: 0.8 }),
          ),
        describeModel: () => Promise.resolve(modelDescription),
        sync: async () => ({ ...EMPTY_SYNC, institutionCount: 1, failures: ['INVALID_API_KEYS'] }),
      });
      await expect(failing.syncNow()).rejects.toThrow(/INVALID_API_KEYS/);
    });

    it('passes the model warning through on an otherwise good run', async () => {
      const warned = new Services({
        handle,
        userDataDir: dir,
        clock: new TestClock(NOW),
        logger: new DiagnosticLogger(new MemorySink(), new TestClock(NOW)),
        keyring: new Keyring(new TestBackend()),
        pipeline: new CategorizationPipeline({ classify: () => classify() }, { confidenceThreshold: 0.8 }),
        buildPipeline: () =>
          Promise.resolve(
            new CategorizationPipeline({ classify: () => classify() }, { confidenceThreshold: 0.8 }),
          ),
        describeModel: () => Promise.resolve(modelDescription),
        sync: async () => ({
          ...EMPTY_SYNC,
          institutionCount: 1,
          added: 4,
          modelFailures: 4,
          modelError: 'overloaded_error',
        }),
      });
      const result = (await warned.syncNow()) as { message: string; warning: string };
      expect(result.message).toContain('4 new transactions');
      expect(result.warning).toContain('overloaded_error');
    });
  });


  describe('the name override wins on every surface', () => {
    it('uses a merchant-wide rename in the transaction register', async () => {
      const first = ((await services.queryTransactions({ limit: 200, offset: 0 })) as {
        rows: Array<{ id: string; merchantKey: string | null; merchantName: string }>;
      }).rows.find((r) => r.merchantKey !== null);
      expect(first).toBeDefined();
      await services.renameMerchant({ merchantKey: first!.merchantKey, displayName: 'MY NAME' });

      const after = (await services.queryTransactions({ limit: 200, offset: 0 })) as {
        rows: Array<{ merchantKey: string | null; merchantName: string }>;
      };
      const renamed = after.rows.filter((r) => r.merchantKey === first!.merchantKey);
      expect(renamed.length).toBeGreaterThan(0);
      for (const row of renamed) expect(row.merchantName).toBe('MY NAME');
    });

    it('uses it in the review queue as well', async () => {
      const queue = (await services.reviewQueue({ limit: 200, offset: 0 })) as {
        rows: Array<{ transaction: { merchantKey: string | null; merchantName: string } }>;
      };
      const target = queue.rows.find((r) => r.transaction.merchantKey !== null);
      expect(target).toBeDefined();
      const key = target!.transaction.merchantKey!;
      await services.renameMerchant({ merchantKey: key, displayName: 'REVIEW NAME' });

      const after = (await services.reviewQueue({ limit: 200, offset: 0 })) as {
        rows: Array<{ transaction: { merchantKey: string | null; merchantName: string } }>;
      };
      for (const row of after.rows) {
        if (row.transaction.merchantKey === key) {
          expect(row.transaction.merchantName).toBe('REVIEW NAME');
        }
      }
    });

    it('labels the merchant breakdown with the override, not the normalized key', async () => {
      const rows = ((await services.queryTransactions({ limit: 200, offset: 0 })) as {
        rows: Array<{ merchantKey: string | null; postedDate: string }>;
      }).rows.filter((r) => r.merchantKey !== null);
      const key = rows[0]!.merchantKey!;
      await services.renameMerchant({ merchantKey: key, displayName: 'BREAKDOWN NAME' });

      const breakdown = (await services.breakdownByMerchant({
        periodStart: '2000-01-01T00:00:00Z',
        periodEnd: '2100-01-01T00:00:00Z',
      })) as { rows: Array<{ categoryId: string; name: string }> };
      const row = breakdown.rows.find((r) => r.categoryId === key);
      if (row) expect(row.name).toBe('BREAKDOWN NAME');
      for (const r of breakdown.rows) expect(r.name).not.toBe('');
    });

    it('never labels a merchant list with the normalized key', async () => {
      const recurring = (await services.listRecurring()) as Array<{
        merchantKey: string;
        merchantName: string;
      }>;
      for (const r of recurring) expect(r.merchantName).not.toBe(r.merchantKey);
    });
  });


  describe('health reports what is actually stored', () => {
    it('counts institutions, accounts and transactions', async () => {
      const h = (await services.health()) as { contents: HealthContents };
      expect(h.contents.institutions).toBeGreaterThan(0);
      expect(h.contents.accounts).toBeGreaterThan(0);
      expect(h.contents.transactions).toBeGreaterThan(0);
    });

    it('separates day-to-day transactions from the rest', async () => {
      const h = (await services.health()) as { contents: HealthContents };
      expect(h.contents.transactionsInEverydayAccounts).toBeLessThanOrEqual(
        h.contents.transactions,
      );
      expect(h.contents.everydayAccounts).toBeLessThanOrEqual(h.contents.accounts);
    });

    it('shows day-to-day transactions dropping to zero when every account is turned off', async () => {
      const institutions = (await services.listInstitutions()) as Array<{
        accounts: Array<{ id: string }>;
      }>;
      for (const inst of institutions) {
        for (const account of inst.accounts) {
          await services.setAccountEveryday({ accountId: account.id, isEveryday: false });
        }
      }
      const h = (await services.health()) as { contents: HealthContents };
      expect(h.contents.everydayAccounts).toBe(0);
      expect(h.contents.transactionsInEverydayAccounts).toBe(0);
      expect(h.contents.transactions).toBeGreaterThan(0);
    });
  });


  describe('the overrides page lists and undoes every user decision', () => {
    it('starts with nothing when the user has changed nothing', async () => {
      const rows = (await services.listOverrides()) as unknown[];
      expect(rows).toEqual([]);
    });

    it('lists a merchant rename and undoes it', async () => {
      const first = ((await services.queryTransactions({ limit: 200, offset: 0 })) as {
        rows: Array<{ merchantKey: string | null }>;
      }).rows.find((r) => r.merchantKey !== null)!;
      await services.renameMerchant({ merchantKey: first.merchantKey, displayName: 'Renamed' });

      const rows = (await services.listOverrides()) as Array<{
        kind: string;
        target: string;
        current: string;
        affectedCount: number;
      }>;
      const rename = rows.find((r) => r.kind === 'merchant_name');
      expect(rename?.current).toBe('Renamed');
      expect(rename?.affectedCount).toBeGreaterThan(0);

      await services.clearOverride({ kind: 'merchant_name', target: first.merchantKey! });
      const after = (await services.listOverrides()) as Array<{ kind: string }>;
      expect(after.some((r) => r.kind === 'merchant_name')).toBe(false);
    });

    it('lists a per-transaction rename with the imported name it replaced', async () => {
      const target = ((await services.queryTransactions({ limit: 1, offset: 0 })) as {
        rows: Array<{ id: string; description: string }>;
      }).rows[0]!;
      await services.updateTransaction({
        transactionId: target.id,
        userMerchantName: 'Just this one',
        applyNameToMerchant: false,
      });

      const rows = (await services.listOverrides()) as Array<{
        kind: string;
        original: string | null;
        current: string;
      }>;
      const record = rows.find((r) => r.kind === 'transaction_name');
      expect(record?.current).toBe('Just this one');
      expect(record?.original).toBeTruthy();

      await services.clearOverride({ kind: 'transaction_name', target: target.id });
      const after = (await services.listOverrides()) as Array<{ kind: string }>;
      expect(after.some((r) => r.kind === 'transaction_name')).toBe(false);
    });

    it('lists an exclusion and a note, and undoes each independently', async () => {
      const target = ((await services.queryTransactions({ limit: 1, offset: 0 })) as {
        rows: Array<{ id: string }>;
      }).rows[0]!;
      await services.updateTransaction({
        transactionId: target.id,
        userExcluded: true,
        userNote: 'Reimbursed by work',
      });

      let rows = (await services.listOverrides()) as Array<{ kind: string; current: string }>;
      expect(rows.find((r) => r.kind === 'excluded')?.current).toBe('Excluded from totals');
      expect(rows.find((r) => r.kind === 'note')?.current).toBe('Reimbursed by work');

      await services.clearOverride({ kind: 'excluded', target: target.id });
      rows = (await services.listOverrides()) as Array<{ kind: string; current: string }>;
      expect(rows.some((r) => r.kind === 'excluded')).toBe(false);
      expect(rows.some((r) => r.kind === 'note')).toBe(true);
    });

    it('lists a recurring override and undoes it', async () => {
      const target = ((await services.queryTransactions({ limit: 1, offset: 0 })) as {
        rows: Array<{ id: string }>;
      }).rows[0]!;
      await services.updateTransaction({
        transactionId: target.id,
        userRecurringOverride: 'not_recurring',
      });
      let rows = (await services.listOverrides()) as Array<{ kind: string; current: string }>;
      expect(rows.find((r) => r.kind === 'recurring')?.current).toBe('Not recurring');

      await services.clearOverride({ kind: 'recurring', target: target.id });
      rows = (await services.listOverrides()) as Array<{ kind: string; current: string }>;
      expect(rows.some((r) => r.kind === 'recurring')).toBe(false);
    });

    it('undoing a category correction restores what it replaced', async () => {
      const target = ((await services.queryTransactions({ limit: 1, offset: 0 })) as {
        rows: Array<{ id: string; categoryId: string }>;
      }).rows[0]!;
      const before = target.categoryId;

      await services.recategorize({ transactionIds: [target.id], categoryId: 'groceries' });
      const changed = ((await services.queryTransactions({ limit: 200, offset: 0 })) as {
        rows: Array<{ id: string; categoryId: string }>;
      }).rows.find((r) => r.id === target.id)!;
      expect(changed.categoryId).toBe('groceries');

      const rows = (await services.listOverrides()) as Array<{ kind: string; current: string }>;
      expect(rows.some((r) => r.kind === 'transaction_category')).toBe(true);

      await services.clearOverride({ kind: 'transaction_category', target: target.id });
      const restored = ((await services.queryTransactions({ limit: 200, offset: 0 })) as {
        rows: Array<{ id: string; categoryId: string }>;
      }).rows.find((r) => r.id === target.id)!;
      expect(restored.categoryId).toBe(before);
    });

    it('lists a merchant-wide category confirmation and undoes it', async () => {
      const target = ((await services.queryTransactions({ limit: 200, offset: 0 })) as {
        rows: Array<{ id: string; merchantKey: string | null }>;
      }).rows.find((r) => r.merchantKey !== null)!;
      await services.updateTransaction({ transactionId: target.id, categoryId: 'groceries' });

      let rows = (await services.listOverrides()) as Array<{ kind: string; current: string }>;
      expect(rows.find((r) => r.kind === 'merchant_category')?.current).toBe('Groceries');

      await services.clearOverride({ kind: 'merchant_category', target: target.merchantKey! });
      rows = (await services.listOverrides()) as Array<{ kind: string; current: string }>;
      expect(rows.some((r) => r.kind === 'merchant_category')).toBe(false);
    });

    it('never lists a transaction category the app assigned by itself', async () => {
      const rows = (await services.listOverrides()) as Array<{ kind: string }>;
      expect(rows.some((r) => r.kind === 'transaction_category')).toBe(false);
    });
  });


  describe('rerunning AI categorization', () => {
    const withModel = { provider: 'anthropic', model: 'claude-haiku-4-5', localOnly: false, reason: '' };

    it('does not skip repeat merchants once the run has learned them', async () => {
      modelDescription = withModel;
      // Every transaction gets an answer, so nothing may be left behind — the
      // pipeline resolves later ones from history learned during this same run.
      const result = (await services.recategorizePending({ scope: 'unresolved' })) as {
        examined: number;
        changed: number;
      };
      expect(result.examined).toBeGreaterThan(0);
      expect(result.changed).toBe(result.examined);
    });

    it('leaves nothing unresolved afterwards', async () => {
      modelDescription = withModel;
      await services.recategorizePending({ scope: 'unresolved' });
      const health = (await services.health()) as { contents: HealthContents };
      expect(health.contents.uncategorizable).toBe(0);
    });

    it('scope "all" reaches more than scope "unresolved"', async () => {
      modelDescription = withModel;
      const unresolved = (await services.recategorizePending({ scope: 'unresolved' })) as {
        examined: number;
      };
      const all = (await services.recategorizePending({ scope: 'all' })) as { examined: number };
      expect(all.examined).toBeGreaterThan(unresolved.examined);
    });

    it('never overwrites a category the user set, at any scope', async () => {
      const target = ((await services.queryTransactions({ limit: 1, offset: 0 })) as {
        rows: Array<{ id: string }>;
      }).rows[0]!;
      await services.recategorize({ transactionIds: [target.id], categoryId: 'groceries' });

      modelDescription = withModel;
      await services.recategorizePending({ scope: 'all' });

      const after = ((await services.queryTransactions({ limit: 200, offset: 0 })) as {
        rows: Array<{ id: string; categoryId: string }>;
      }).rows.find((r) => r.id === target.id)!;
      expect(after.categoryId).toBe('groceries');
    });

    it('stops after repeated model failures rather than one request per row', async () => {
      modelDescription = withModel;
      let calls = 0;
      classify = () => {
        calls += 1;
        return Promise.reject(new Error('401 invalid x-api-key'));
      };
      const result = (await services.recategorizePending({ scope: 'all' })) as {
        ok: boolean;
        stoppedEarly: boolean;
        examined: number;
        message: string;
      };
      expect(result.ok).toBe(false);
      expect(result.stoppedEarly).toBe(true);
      // Bounded by the failure limit, however many transactions there are.
      expect(calls).toBeLessThanOrEqual(5);
      expect(result.message).toContain('401 invalid x-api-key');
    });

    it('defaults to the unresolved scope when none is given', async () => {
      modelDescription = withModel;
      const health = (await services.health()) as { contents: HealthContents };
      const implicit = (await services.recategorizePending()) as { examined: number };
      expect(implicit.examined).toBeGreaterThan(0);
      // Scoped, not everything: 'all' would have reached every transaction.
      expect(implicit.examined).toBeLessThan(health.contents.transactions);
    });

    it('refuses and explains when no model is configured', async () => {
      const result = (await services.recategorizePending({ scope: 'all' })) as {
        ok: boolean;
        changed: number;
        message: string;
      };
      expect(result.ok).toBe(false);
      expect(result.changed).toBe(0);
      expect(result.message).toBe('History only in tests');
    });
  });


  describe('adding income the detector cannot see', () => {
    async function anAccountId(): Promise<string> {
      const institutions = (await services.listInstitutions()) as Array<{
        accounts: Array<{ id: string }>;
      }>;
      return institutions[0]!.accounts[0]!.id;
    }

    it('appears in the income list, confirmed', async () => {
      const before = ((await services.listIncome()) as unknown[]).length;
      await services.addIncomeSource({
        accountId: await anAccountId(),
        merchantKey: 'freelance retainer',
        cadence: 'monthly',
        expectedAmountMinor: 240_000,
        nextExpectedDate: '2026-09-15',
      });
      const after = (await services.listIncome()) as Array<{
        expectedAmountMinor: number;
        isUserConfirmed: boolean;
        cadence: string;
      }>;
      expect(after.length).toBe(before + 1);
      const added = after.find((r) => r.expectedAmountMinor === 240_000)!;
      expect(added.isUserConfirmed).toBe(true);
      expect(added.cadence).toBe('monthly');
    });

    it('refuses an account that does not exist rather than orphaning a row', async () => {
      await expect(
        services.addIncomeSource({
          accountId: 'acct_nope',
          cadence: 'weekly',
          expectedAmountMinor: 1000,
          nextExpectedDate: '2026-09-01',
        }),
      ).rejects.toThrow(/no longer exists/);
    });

    it('names it "manual" when the user gives no name', async () => {
      await services.addIncomeSource({
        accountId: await anAccountId(),
        cadence: 'weekly',
        expectedAmountMinor: 5000,
        nextExpectedDate: '2026-09-01',
      });
      const rows = (await services.listIncome()) as Array<{
        merchantKey: string;
        expectedAmountMinor: number;
      }>;
      expect(rows.find((r) => r.expectedAmountMinor === 5000)?.merchantKey).toBe('manual');
    });

    it('can be overridden and cleared like a detected one', async () => {
      const { id } = (await services.addIncomeSource({
        accountId: await anAccountId(),
        cadence: 'weekly',
        expectedAmountMinor: 7000,
        nextExpectedDate: '2026-09-01',
      })) as { id: string };
      await services.overrideIncome({ id, cadence: 'monthly' });
      let rows = (await services.listIncome()) as Array<{ id: string; cadence: string }>;
      expect(rows.find((r) => r.id === id)?.cadence).toBe('monthly');

      await services.clearIncomeOverride(id);
      rows = (await services.listIncome()) as Array<{ id: string; cadence: string }>;
      expect(rows.find((r) => r.id === id)).toBeDefined();
    });
  });

});
