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
      isMonitored: true,
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
      sync: async () => {},
    });
  });

  afterEach(() => {
    handle.close();
    rmSync(dir, { recursive: true, force: true });
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
    expect(await services.syncNow()).toMatchObject({ started: true });
  });

  it('disconnecting an institution removes it', async () => {
    await services.disconnectInstitution('inst_1');
    expect((await services.listInstitutions()) as unknown[]).toHaveLength(0);
  });
});
