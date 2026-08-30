import { app, dialog, shell } from 'electron';
import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as t from '@main/db/schema';
import type { DatabaseHandle } from '@main/db/client';
import type { AppServices } from '@main/ipc/handlers/services';
import { IpcFailure } from '@main/ipc/registry';
import { assessCompleteness, type Completeness, type InstitutionState } from '@main/plaid/health';
import { breakdownByCategory, spendingTotalMinor } from '@main/analysis/spending';
import type { SpendingTransaction } from '@main/analysis/spending';
import { projectBalance } from '@main/analysis/income';
import { buildMonthlyReport, buildWeeklyDigest } from '@main/analysis/reports';
import { runAnalysisPass } from '@main/analysis/pass';
import { monthBoundaries, weekBoundaries } from '@shared/periods';
import { computeBaseline } from '@main/analysis/baselines';
import type { CategorizationPipeline } from '@main/categorization/pipeline';
import { createCategory, mergeCategories, type Category } from '@main/categories/manage';
import { liveCategorization, planRetroactive } from '@main/categorization/corrections';
import type { CategorizationRecord } from '@main/categorization/corrections';
import { buildExport, summarizeHealth } from '@main/diagnostics/export';
import type { DiagnosticLogger } from '@main/diagnostics/logger';
import { DEFAULT_SETTINGS, mergeSettings } from '@main/settings/index';
import { deleteAllData, exportBackup, restoreBackup } from '@main/data/backup';
import type { Keyring } from '@main/secrets/keyring';
import type { Clock } from '@shared/clock';
import type { AppSettings } from '@shared/types';
import { listOllamaModels } from '@main/categorization/ollama';
import { explainModelError } from '@main/categorization/errors';
import { createPlaidClient, type PlaidEnvironment } from '@main/plaid/client';
import { exchangePublicToken, pollForPublicToken, startHostedLink } from '@main/plaid/link';
import { fetchItemAccounts } from '@main/plaid/accounts';
import { isEverydayAccount } from '@main/accounts/everyday';
import { summarizeSync, type SyncOutcome } from '@main/sync/outcome';
import { resolveMerchantName } from '@shared/merchant-name';
import type { OverrideKind, OverrideRecord } from '@shared/types';

export interface ModelDescription {
  readonly provider: string;
  readonly model: string | null;
  readonly localOnly: boolean;
  readonly reason: string;
}
import { randomUUID as uuid } from 'node:crypto';

/**
 * The composition root.
 *
 * Every module above this file is pure and knows nothing of the others. This is
 * where they are assembled into a running application — each IPC channel backed
 * by real work against the encrypted database.
 *
 * Kept as one class deliberately: splitting it would add indirection whose only
 * purpose is a shorter file, which Principle IV rejects.
 */

const BALANCE_FLOOR_MINOR = 100_000;
const BURN_WINDOW_DAYS = 30;
const UNCATEGORIZABLE = 'uncategorizable';
/** Stop a bulk recategorization rather than fire one doomed request per row. */
const MODEL_FAILURE_LIMIT = 5;

export interface ServiceDeps {
  readonly handle: DatabaseHandle;
  readonly userDataDir: string;
  readonly clock: Clock;
  readonly logger: DiagnosticLogger;
  readonly keyring: Keyring;
  readonly pipeline: CategorizationPipeline;
  /**
   * Builds a categorizer from the CURRENT settings. Needed as a factory rather
   * than an instance: entering an API key in Settings must take effect without
   * a restart, and the instance above is the one captured at launch.
   */
  readonly buildPipeline: () => Promise<CategorizationPipeline>;
  readonly describeModel: () => Promise<ModelDescription>;
  readonly sync: () => Promise<SyncOutcome>;
}

type TransactionRow = typeof t.transactions.$inferSelect;

export class Services implements AppServices {
  private pendingLinkToken: string | null = null;

  constructor(private readonly deps: ServiceDeps) {}

  private get db(): DatabaseHandle['db'] {
    return this.deps.handle.db;
  }

  isOnline(): boolean {
    return true;
  }

  async completeness(): Promise<Completeness> {
    const rows = await this.db.select().from(t.institutions);
    const states: InstitutionState[] = rows.map((r) => ({
      id: r.id,
      name: r.institutionName,
      status: r.status,
      lastSyncedAt: r.lastSyncedAt ? new Date(r.lastSyncedAt) : null,
    }));
    return assessCompleteness(states, this.deps.clock.now());
  }

  // ---- Setup and connection ------------------------------------------------

  async setupStatus(): Promise<unknown> {
    const secrets = await this.db.select().from(t.settings).where(eq(t.settings.isSecret, true));
    const has = (key: string): boolean => secrets.some((s) => s.key === key && s.value.length > 0);
    const accounts = await this.db.select().from(t.accounts);
    // Presence only — never the values (FR-047).
    return {
      plaidConfigured: has('plaidClientId') && has('plaidSecret'),
      categorizationConfigured: has('anthropicApiKey'),
      accountCount: accounts.length,
      encryptionAvailable: true,
    };
  }

  async saveCredentials(input: unknown): Promise<unknown> {
    const p = input as Record<string, string | undefined>;
    for (const key of ['plaidClientId', 'plaidSecret', 'anthropicApiKey'] as const) {
      const value = p[key];
      if (value) {
        const sealed = (await this.deps.keyring.seal(value)).toString('base64');
        await this.upsertSetting(key, sealed, true);
      }
    }
    if (p['plaidEnv']) await this.upsertSetting('plaidEnv', p['plaidEnv'], false);
    return { ok: true };
  }

  async startLink(): Promise<unknown> {
    const client = await this.plaidClient();
    try {
      const session = await startHostedLink(client, 'local-user');
      this.pendingLinkToken = session.linkToken;
      return session;
    } catch (error) {
      throw this.plaidFailure(error);
    }
  }

  /**
   * Poll for the completed Hosted Link session, then persist the Item, its
   * accounts, and trigger the initial backfill (research.md R1, FR-004).
   */
  async completeLink(linkToken: string): Promise<unknown> {
    const token = linkToken || this.pendingLinkToken;
    if (!token) {
      throw new IpcFailure('PLAID_UNCONFIGURED', 'No Plaid session is in progress', true);
    }
    const client = await this.plaidClient();

    let publicToken: string | null;
    try {
      publicToken = await pollForPublicToken(client, token);
    } catch (error) {
      throw this.plaidFailure(error);
    }
    // Not an error: the user is still in the flow. The renderer keeps polling.
    if (!publicToken) return { pending: true };

    const { accessToken, itemId } = await exchangePublicToken(client, publicToken);
    const fetched = await fetchItemAccounts(client, accessToken);

    const institutionId = `inst_${uuid().slice(0, 8)}`;
    const sealed = (await this.deps.keyring.seal(accessToken)).toString('base64');
    await this.db.insert(t.institutions).values({
      id: institutionId,
      plaidItemId: itemId,
      accessTokenEncrypted: sealed,
      institutionName: fetched.institutionName,
      syncCursor: null,
      status: 'healthy',
      lastSyncedAt: null,
      lastAttemptedSyncAt: null,
      createdAt: this.deps.clock.now().toISOString(),
    });
    for (const a of fetched.accounts) {
      await this.db.insert(t.accounts).values({
        id: `acct_${uuid().slice(0, 8)}`,
        institutionId,
        plaidAccountId: a.plaidAccountId,
        name: a.name,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
        currentBalanceMinor: a.currentBalanceMinor,
        balanceAsOf: this.deps.clock.now().toISOString(),
        // Savings and investments are not day-to-day money; the user can
        // change this per account.
        isEveryday: isEverydayAccount(a.type, a.subtype),
      });
    }

    this.pendingLinkToken = null;
    // Null cursor means a full historical backfill on this first sync (FR-004).
    await this.deps.sync();
    return { institutionId, accountsAdded: fetched.accounts.length };
  }

  /** Build a Plaid client from the stored, sealed credentials. */
  private async plaidClient(): Promise<ReturnType<typeof createPlaidClient>> {
    const [clientId, secret, env] = await Promise.all([
      this.readSecret('plaidClientId'),
      this.readSecret('plaidSecret'),
      this.readPlainSetting('plaidEnv'),
    ]);
    if (!clientId || !secret) {
      throw new IpcFailure(
        'PLAID_UNCONFIGURED',
        'Add your Plaid credentials in Settings before connecting an account',
        true,
        'Open Settings',
      );
    }
    return createPlaidClient({
      clientId,
      secret,
      environment: (env === 'production' ? 'production' : 'sandbox') as PlaidEnvironment,
    });
  }

  private plaidFailure(error: unknown): IpcFailure {
    const message = error instanceof Error ? error.message : 'Plaid request failed';
    if (/ITEM_LOGIN_REQUIRED|PENDING_EXPIRATION/i.test(message)) {
      return new IpcFailure('PLAID_REAUTH_REQUIRED', 'Reconnect this account', true, 'Reconnect');
    }
    if (/RATE_LIMIT/i.test(message)) {
      return new IpcFailure('PLAID_RATE_LIMITED', 'Plaid is rate limiting; try again shortly', true);
    }
    if (/INVALID_API_KEYS|INVALID_CREDENTIALS|401|403/i.test(message)) {
      return new IpcFailure(
        'PLAID_UNCONFIGURED',
        'Plaid rejected those credentials. Check the client ID, secret, and environment.',
        true,
        'Open Settings',
      );
    }
    return new IpcFailure('INTERNAL', message, true);
  }

  private async readSecret(key: string): Promise<string | null> {
    const rows = await this.db.select().from(t.settings).where(eq(t.settings.key, key));
    const value = rows[0]?.value;
    if (!value) return null;
    return (await this.deps.keyring.open(Buffer.from(value, 'base64'))).value;
  }

  private async readPlainSetting(key: string): Promise<string | null> {
    const rows = await this.db.select().from(t.settings).where(eq(t.settings.key, key));
    return rows[0]?.value ?? null;
  }

  async listInstitutions(): Promise<unknown> {
    const [institutions, accounts] = await Promise.all([
      this.db.select().from(t.institutions),
      this.db.select().from(t.accounts),
    ]);
    return institutions.map((r) => ({
      id: r.id,
      institutionName: r.institutionName,
      status: r.status,
      lastSyncedAt: r.lastSyncedAt,
      accountCount: accounts.filter((a) => a.institutionId === r.id).length,
      accounts: accounts
        .filter((a) => a.institutionId === r.id)
        .map((a) => ({
          id: a.id,
          name: a.name,
          mask: a.mask,
          type: a.type,
          subtype: a.subtype,
          currentBalanceMinor: a.currentBalanceMinor,
          balanceAsOf: a.balanceAsOf,
          isEveryday: a.isEveryday,
        })),
    }));
  }

  /** Include or exclude an account from day-to-day money. */
  async setAccountEveryday(input: unknown): Promise<unknown> {
    const p = input as { accountId: string; isEveryday: boolean };
    await this.db
      .update(t.accounts)
      .set({ isEveryday: p.isEveryday })
      .where(eq(t.accounts.id, p.accountId));
    return { ok: true };
  }

  async disconnectInstitution(id: string): Promise<unknown> {
    await this.db.delete(t.institutions).where(eq(t.institutions.id, id));
    return { ok: true };
  }

  async reauthInstitution(): Promise<unknown> {
    return this.startLink();
  }

  // ---- Reading money -------------------------------------------------------

  async dashboard(range: unknown): Promise<unknown> {
    const { periodStart, periodEnd } = range as { periodStart: string; periodEnd: string };
    const [transactions, names, parents, completeness, accounts] = await Promise.all([
      this.spendingIn(periodStart, periodEnd),
      this.categoryNames(),
      this.categoryParents(),
      this.completeness(),
      this.db.select().from(t.accounts),
    ]);

    const breakdown = breakdownByCategory(transactions);
    const incomeMinor = transactions
      .filter((x) => x.amountMinor > 0 && !x.isInternalTransfer)
      .reduce((a, x) => a + x.amountMinor, 0);
    const spendingMinor = spendingTotalMinor(transactions);

    return {
      balances: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        mask: a.mask,
        type: a.type,
        currentBalanceMinor: a.currentBalanceMinor,
        balanceAsOf: a.balanceAsOf,
      })),
      cashFlowMinor: { incomeMinor, spendingMinor, netMinor: incomeMinor + spendingMinor },
      categoryBreakdown: { ...this.namedRows(breakdown, names, parents), ...completeness },
      whatChanged: [],
      runway: await this.runway(),
      ...completeness,
    };
  }

  async dashboardFromCache(): Promise<unknown> {
    const now = this.deps.clock.now();
    return this.dashboard({
      periodStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
    });
  }

  async breakdownByCategory(range: unknown): Promise<unknown> {
    const { periodStart, periodEnd } = range as { periodStart: string; periodEnd: string };
    const [transactions, names, parents, completeness] = await Promise.all([
      this.spendingIn(periodStart, periodEnd),
      this.categoryNames(),
      this.categoryParents(),
      this.completeness(),
    ]);
    return {
      ...this.namedRows(breakdownByCategory(transactions), names, parents),
      ...completeness,
    };
  }

  async breakdownByMerchant(range: unknown): Promise<unknown> {
    const { periodStart, periodEnd } = range as { periodStart: string; periodEnd: string };
    const [all, everydayIds, aliases] = await Promise.all([
      this.transactionsIn(periodStart, periodEnd),
      this.everydayAccountIds(),
      this.merchantAliases(),
    ]);
    const rows = this.everyday(all, everydayIds);
    const totals = new Map<string, { name: string; totalMinor: number; count: number }>();
    for (const r of rows) {
      if (!this.countsAsSpending(r)) continue;
      const key = r.merchantKey ?? r.description;
      // Grouped by the stable key, but labelled with the name the user chose —
      // this list used to show the normalized key back to them.
      const cur = totals.get(key) ?? { name: resolveMerchantName(r, aliases), totalMinor: 0, count: 0 };
      totals.set(key, { ...cur, totalMinor: cur.totalMinor + r.amountMinor, count: cur.count + 1 });
    }
    const out = [...totals.entries()]
      .map(([key, v]) => ({ categoryId: key, name: v.name, totalMinor: v.totalMinor, txCount: v.count }))
      .sort((a, b) => a.totalMinor - b.totalMinor);
    return {
      rows: out,
      totalMinor: out.reduce((a, r) => a + r.totalMinor, 0),
      ...(await this.completeness()),
    };
  }

  async queryTransactions(query: unknown): Promise<unknown> {
    const q = query as {
      periodStart?: string;
      periodEnd?: string;
      categoryIds?: string[];
      merchantKey?: string;
      direction?: 'all' | 'in' | 'out';
      minAmountMinor?: number;
      maxAmountMinor?: number;
      limit: number;
      offset: number;
    };
    const [rows, live, completeness, aliases] = await Promise.all([
      this.transactionsIn(q.periodStart, q.periodEnd),
      this.liveCategorizations(),
      this.completeness(),
      this.merchantAliases(),
    ]);

    let filtered = rows;
    if (q.categoryIds?.length) {
      const wanted = new Set(q.categoryIds);
      filtered = filtered.filter((r) => wanted.has(live.get(r.id)?.categoryId ?? ''));
    }
    if (q.merchantKey) {
      const needle = q.merchantKey.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          (r.merchantName ?? '').toLowerCase().includes(needle) ||
          (r.userMerchantName ?? '').toLowerCase().includes(needle) ||
          r.description.toLowerCase().includes(needle),
      );
    }
    if (q.direction === 'in') filtered = filtered.filter((r) => r.amountMinor > 0);
    if (q.direction === 'out') filtered = filtered.filter((r) => r.amountMinor < 0);
    if (q.minAmountMinor !== undefined) {
      const min = q.minAmountMinor;
      filtered = filtered.filter((r) => Math.abs(r.amountMinor) >= min);
    }
    if (q.maxAmountMinor !== undefined) {
      const max = q.maxAmountMinor;
      filtered = filtered.filter((r) => Math.abs(r.amountMinor) <= max);
    }

    // Newest first. Without an explicit order the register returns rows in
    // insertion order and the 100-row page can hide recent activity entirely —
    // which is how income became invisible.
    filtered = [...filtered].sort((a, b) => {
      const byDate = b.postedDate.localeCompare(a.postedDate);
      return byDate !== 0 ? byDate : (b.datetime ?? '').localeCompare(a.datetime ?? '');
    });

    return {
      rows: filtered.slice(q.offset, q.offset + q.limit).map((r) => {
        const c = live.get(r.id);
        return {
          id: r.id,
          amountMinor: r.amountMinor,
          merchantName: resolveMerchantName(r, aliases),
          merchantKey: r.merchantKey,
          description: r.description,
          postedDate: r.postedDate,
          categoryId: c?.categoryId ?? UNCATEGORIZABLE,
          confidence: c?.confidence ?? 0,
          needsReview: c?.needsReview ?? true,
          isInternalTransfer: r.isInternalTransfer,
          originalCurrency: r.originalCurrency,
          originalAmountMinor: r.originalAmountMinor,
          userMerchantName: r.userMerchantName,
          userNote: r.userNote,
          userExcluded: r.userExcluded,
          userRecurringOverride: r.userRecurringOverride,
        };
      }),
      totalCount: filtered.length,
      ...completeness,
    };
  }

  async trends(range: unknown): Promise<unknown> {
    const { periodStart, periodEnd } = range as { periodStart: string; periodEnd: string };
    const rows = await this.transactionsIn(periodStart, periodEnd);
    const byMonth = new Map<string, number>();
    for (const r of rows) {
      if (!this.countsAsSpending(r)) continue;
      const key = r.postedDate.slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + Math.abs(r.amountMinor));
    }
    const series = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, spendingMinor]) => ({ label, spendingMinor }));
    return {
      series,
      comparisonSeries: [],
      priorAverageMinor:
        series.length === 0
          ? null
          : Math.round(series.reduce((a, s) => a + s.spendingMinor, 0) / series.length),
    };
  }

  // ---- Income --------------------------------------------------------------

  async listIncome(): Promise<unknown> {
    const [rows, names] = await Promise.all([
      this.db.select().from(t.incomeSources),
      this.merchantDisplayNames(),
    ]);
    return rows.map((r) => ({
      id: r.id,
      merchantKey: r.merchantKey,
      merchantName: names.get(r.merchantKey) ?? r.merchantKey,
      expectedAmountMinor: r.expectedAmountMinor,
      cadence: r.cadence,
      nextExpectedDate: r.nextExpectedDate,
      detectionConfidence: r.detectionConfidence,
      isUserConfirmed: r.isUserConfirmed,
    }));
  }

  async confirmIncome(id: string): Promise<unknown> {
    await this.db.update(t.incomeSources).set({ isUserConfirmed: true }).where(eq(t.incomeSources.id, id));
    return { ok: true };
  }

  async overrideIncome(input: unknown): Promise<unknown> {
    const p = input as {
      id: string;
      cadence?: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
      expectedAmountMinor?: number;
      nextExpectedDate?: string;
    };
    await this.db
      .update(t.incomeSources)
      .set({
        isUserConfirmed: true,
        ...(p.cadence ? { cadence: p.cadence } : {}),
        ...(p.expectedAmountMinor !== undefined
          ? { expectedAmountMinor: p.expectedAmountMinor }
          : {}),
        ...(p.nextExpectedDate ? { nextExpectedDate: p.nextExpectedDate } : {}),
      })
      .where(eq(t.incomeSources.id, p.id));
    return { ok: true };
  }

  /**
   * Record an income source the detector never found (FR-071).
   *
   * Cash, a new job's first deposit, anything irregular enough that three
   * observations do not exist yet. Marked confirmed so detection leaves it be.
   */
  async addIncomeSource(input: unknown): Promise<unknown> {
    const p = input as {
      accountId: string;
      merchantKey?: string;
      cadence: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
      expectedAmountMinor: number;
      nextExpectedDate: string;
    };
    const accounts = await this.db
      .select()
      .from(t.accounts)
      .where(eq(t.accounts.id, p.accountId));
    if (accounts.length === 0) {
      throw new IpcFailure(
        'VALIDATION_FAILED',
        'That account no longer exists',
        true,
        'Choose another',
      );
    }

    const id = `inc_${randomUUID().slice(0, 8)}`;
    await this.db.insert(t.incomeSources).values({
      id,
      accountId: p.accountId,
      merchantKey: p.merchantKey?.trim() || 'manual',
      expectedAmountMinor: p.expectedAmountMinor,
      cadence: p.cadence,
      nextExpectedDate: p.nextExpectedDate,
      detectionConfidence: 1,
      isUserConfirmed: true,
      isActive: true,
    });
    return { id };
  }

  async clearIncomeOverride(id: string): Promise<unknown> {
    await this.db
      .update(t.incomeSources)
      .set({ isUserConfirmed: false })
      .where(eq(t.incomeSources.id, id));
    return { ok: true };
  }

  // ---- Corrections ---------------------------------------------------------

  async reviewQueue(page: unknown): Promise<unknown> {
    const { limit, offset } = page as { limit: number; offset: number };
    const [live, txs, aliases] = await Promise.all([
      this.liveCategorizations(),
      this.db.select().from(t.transactions),
      this.merchantAliases(),
    ]);
    const byId = new Map(txs.map((x) => [x.id, x]));
    const flagged = [...live.values()].filter((c) => c.needsReview && !c.isConfirmed);

    return {
      rows: flagged.slice(offset, offset + limit).flatMap((c) => {
        const tx = byId.get(c.transactionId);
        if (!tx) return [];
        return [
          {
            transaction: {
              id: tx.id,
              amountMinor: tx.amountMinor,
              merchantName: resolveMerchantName(tx, aliases),
              merchantKey: tx.merchantKey,
              description: tx.description,
              userMerchantName: tx.userMerchantName,
              userNote: tx.userNote,
              userExcluded: tx.userExcluded,
              userRecurringOverride: tx.userRecurringOverride,
              postedDate: tx.postedDate,
              categoryId: c.categoryId,
              confidence: c.confidence,
              needsReview: true,
              isInternalTransfer: tx.isInternalTransfer,
              originalCurrency: tx.originalCurrency,
              originalAmountMinor: tx.originalAmountMinor,
            },
            guessCategoryId: c.categoryId,
            confidence: c.confidence,
            reasoning: c.reasoning ?? null,
          },
        ];
      }),
      totalCount: flagged.length,
    };
  }

  async recategorize(input: unknown): Promise<unknown> {
    const { transactionIds, categoryId } = input as { transactionIds: string[]; categoryId: string };
    const at = this.deps.clock.now().toISOString();
    for (const id of transactionIds) await this.supersede(id, categoryId, at);

    // FR-074: report what a retroactive pass WOULD change. Does not apply it.
    const first = transactionIds[0];
    if (!first) return { updated: 0, restatedPeriods: [], retroactiveCandidateCount: 0 };
    const rows = await this.db.select().from(t.transactions).where(eq(t.transactions.id, first));
    const merchantKey = rows[0]?.merchantKey;
    if (!merchantKey) {
      return { updated: transactionIds.length, restatedPeriods: [], retroactiveCandidateCount: 0 };
    }

    // The correction teaches future categorization deterministically (FR-016).
    this.deps.pipeline.confirmCategory(merchantKey, categoryId);
    const plan = planRetroactive(
      await this.categorizationRecords(),
      await this.transactionIdsForMerchant(merchantKey),
      categoryId,
    );
    return {
      updated: transactionIds.length,
      restatedPeriods: [],
      retroactiveCandidateCount: plan.affectedCount,
    };
  }

  async applyRetroactive(input: unknown): Promise<unknown> {
    const { merchantKey, categoryId } = input as { merchantKey: string; categoryId: string };
    const plan = planRetroactive(
      await this.categorizationRecords(),
      await this.transactionIdsForMerchant(merchantKey),
      categoryId,
    );
    const at = this.deps.clock.now().toISOString();
    for (const id of plan.affectedTransactionIds) await this.supersede(id, categoryId, at);
    return {
      updated: plan.affectedCount,
      skippedUserConfirmed: plan.protectedCount,
      restatedPeriods: [],
    };
  }

  /**
   * Edit anything the user controls on a transaction.
   *
   * Overrides are stored in their own columns; the imported values are never
   * mutated, so a re-sync cannot clobber an edit and the original stays
   * auditable.
   */
  async updateTransaction(input: unknown): Promise<unknown> {
    const p = input as {
      transactionId: string;
      categoryId?: string;
      userMerchantName?: string | null;
      applyNameToMerchant?: boolean;
      userNote?: string | null;
      userExcluded?: boolean;
      userRecurringOverride?: 'recurring' | 'not_recurring' | null;
    };

    const target = (
      await this.db.select().from(t.transactions).where(eq(t.transactions.id, p.transactionId))
    )[0];

    const patch: Record<string, unknown> = {};
    if (p.userMerchantName !== undefined) patch['userMerchantName'] = p.userMerchantName;

    // A rename applies to the whole merchant by default. Renaming row by row is
    // the manual bookkeeping this product exists to avoid.
    if (p.userMerchantName !== undefined && p.applyNameToMerchant !== false && target?.merchantKey) {
      if (p.userMerchantName === null) {
        await this.db
          .delete(t.merchantAliases)
          .where(eq(t.merchantAliases.merchantKey, target.merchantKey));
      } else {
        await this.db
          .insert(t.merchantAliases)
          .values({
            merchantKey: target.merchantKey,
            displayName: p.userMerchantName,
            createdAt: this.deps.clock.now().toISOString(),
          })
          .onConflictDoUpdate({
            target: t.merchantAliases.merchantKey,
            set: { displayName: p.userMerchantName },
          });
      }
    }
    if (p.userNote !== undefined) patch['userNote'] = p.userNote;
    if (p.userExcluded !== undefined) patch['userExcluded'] = p.userExcluded;
    if (p.userRecurringOverride !== undefined) {
      patch['userRecurringOverride'] = p.userRecurringOverride;
    }
    if (Object.keys(patch).length > 0) {
      await this.db.update(t.transactions).set(patch).where(eq(t.transactions.id, p.transactionId));
    }

    let retroactiveCandidateCount = 0;
    if (p.categoryId) {
      await this.supersede(p.transactionId, p.categoryId, this.deps.clock.now().toISOString());

      // A confirmed category becomes the default for this merchant going
      // forward, so the same correction is never needed twice (FR-016).
      if (target?.merchantKey) {
        this.deps.pipeline.confirmCategory(target.merchantKey, p.categoryId);
        await this.db
          .insert(t.merchantProfiles)
          .values({
            merchantKey: target.merchantKey,
            categoryDistribution: '{}',
            userConfirmedCategoryId: p.categoryId,
            transactionCount: 0,
            lastUpdatedAt: this.deps.clock.now().toISOString(),
          })
          .onConflictDoUpdate({
            target: t.merchantProfiles.merchantKey,
            set: { userConfirmedCategoryId: p.categoryId },
          });

        // Report what a retroactive pass WOULD change; do not apply it (FR-074).
        retroactiveCandidateCount = planRetroactive(
          await this.categorizationRecords(),
          await this.transactionIdsForMerchant(target.merchantKey),
          p.categoryId,
        ).affectedCount;
      }
    }

    // A user marking something recurring is authoritative over detection.
    if (p.userRecurringOverride === 'not_recurring') {
      const key = target?.merchantKey;
      if (key) {
        await this.db
          .update(t.recurringCharges)
          .set({ status: 'inactive' })
          .where(eq(t.recurringCharges.merchantKey, key));
      }
    }

    return {
      ok: true,
      merchantKey: target?.merchantKey ?? null,
      retroactiveCandidateCount,
    };
  }

  async dismissFlags(ids: string[]): Promise<unknown> {
    for (const id of ids) {
      await this.db
        .update(t.categorizations)
        .set({ needsReview: false })
        .where(and(eq(t.categorizations.transactionId, id), isNull(t.categorizations.supersededBy)));
    }
    return { ok: true };
  }

  // ---- Categories ----------------------------------------------------------

  async listCategories(): Promise<unknown> {
    const [categories, categorizations] = await Promise.all([
      this.db.select().from(t.categories),
      this.db.select().from(t.categorizations).where(isNull(t.categorizations.supersededBy)),
    ]);
    const usage = new Map<string, number>();
    for (const c of categorizations) {
      usage.set(c.categoryId, (usage.get(c.categoryId) ?? 0) + 1);
    }
    const childCount = new Map<string, number>();
    for (const c of categories) {
      if (c.parentId) childCount.set(c.parentId, (childCount.get(c.parentId) ?? 0) + 1);
    }
    return categories.map((c) => ({
      ...c,
      usageCount: usage.get(c.id) ?? 0,
      childCount: childCount.get(c.id) ?? 0,
      // Only an unused, childless, non-system category can be deleted; anything
      // else would orphan history or break reconciliation.
      // Anything can be deleted; whether it needs a destination first is the
      // question the UI asks.
      needsReassignment: (usage.get(c.id) ?? 0) > 0 || (childCount.get(c.id) ?? 0) > 0,
    }));
  }

  /**
   * Delete a category, optionally moving its transactions somewhere else.
   *
   * Any category can go, including the ones shipped by default — a taxonomy the
   * user cannot prune is one they will work around instead. What is never
   * allowed is orphaning history: if transactions reference it, the caller must
   * say where they go, which keeps the reconciliation invariant intact
   * (Constitution II).
   */
  async deleteCategory(input: unknown): Promise<unknown> {
    const p = typeof input === 'string' ? { id: input } : (input as { id: string; reassignToId?: string });
    const rows = await this.db.select().from(t.categories).where(eq(t.categories.id, p.id));
    const category = rows[0];
    if (!category) throw new IpcFailure('INTERNAL', 'That category no longer exists', false);

    const children = await this.db.select().from(t.categories).where(eq(t.categories.parentId, p.id));
    if (children.length > 0 && !p.reassignToId) {
      throw new IpcFailure(
        'VALIDATION_FAILED',
        `${children.length} subcategor${children.length === 1 ? 'y' : 'ies'} would be orphaned. ` +
          'Choose where they should go.',
        true,
      );
    }

    const inUse = await this.db
      .select()
      .from(t.categorizations)
      .where(and(eq(t.categorizations.categoryId, p.id), isNull(t.categorizations.supersededBy)));

    if (inUse.length > 0 && !p.reassignToId) {
      throw new IpcFailure(
        'VALIDATION_FAILED',
        `${inUse.length} transaction${inUse.length === 1 ? '' : 's'} use this category. ` +
          'Choose where they should move.',
        true,
        'Choose a category',
      );
    }

    if (p.reassignToId) {
      if (p.reassignToId === p.id) {
        throw new IpcFailure('VALIDATION_FAILED', 'Pick a different category to move them to', false);
      }
      const target = await this.db
        .select()
        .from(t.categories)
        .where(eq(t.categories.id, p.reassignToId));
      if (!target[0]) {
        throw new IpcFailure('VALIDATION_FAILED', 'That destination category does not exist', false);
      }

      // Move every categorization, live and superseded, so history stays
      // resolvable rather than pointing at a row that no longer exists.
      await this.db
        .update(t.categorizations)
        .set({ categoryId: p.reassignToId })
        .where(eq(t.categorizations.categoryId, p.id));

      // Subcategories move up to the destination rather than being deleted.
      await this.db
        .update(t.categories)
        .set({ parentId: target[0].parentId === null ? p.reassignToId : target[0].parentId })
        .where(eq(t.categories.parentId, p.id));

      await this.db
        .update(t.merchantProfiles)
        .set({ userConfirmedCategoryId: p.reassignToId })
        .where(eq(t.merchantProfiles.userConfirmedCategoryId, p.id));
    }

    await this.db.delete(t.categories).where(eq(t.categories.id, p.id));
    return { ok: true, movedTransactions: p.reassignToId ? inUse.length : 0 };
  }

  async createCategory(input: unknown): Promise<unknown> {
    const p = input as { name: string; parentId: string | null };
    const existing = (await this.db.select().from(t.categories)) as Category[];
    let next: Category[];
    try {
      next = createCategory(existing, {
        id: `cat_${randomUUID().slice(0, 8)}`,
        name: p.name,
        parentId: p.parentId,
      });
    } catch (e) {
      throw new IpcFailure('CATEGORY_NESTING_EXCEEDED', (e as Error).message, false);
    }
    const added = next[next.length - 1];
    if (added) await this.db.insert(t.categories).values(added);
    return { id: added?.id };
  }

  async renameCategory(input: unknown): Promise<unknown> {
    const p = input as { id: string; name: string };
    // Ids are stable, so a rename cannot affect any comparison (FR-083).
    await this.db.update(t.categories).set({ name: p.name }).where(eq(t.categories.id, p.id));
    return { ok: true };
  }

  async mergeCategories(input: unknown): Promise<unknown> {
    const p = input as { sourceId: string; targetId: string };
    const existing = (await this.db.select().from(t.categories)) as Category[];
    const result = mergeCategories(existing, p.sourceId, p.targetId);
    const affected = await this.db
      .select()
      .from(t.categorizations)
      .where(eq(t.categorizations.categoryId, p.sourceId));
    await this.db
      .update(t.categorizations)
      .set({ categoryId: result.reassignTo })
      .where(eq(t.categorizations.categoryId, p.sourceId));
    // Source row retained so historical references still resolve (FR-081).
    await this.db
      .update(t.categories)
      .set({ mergedIntoId: result.reassignTo })
      .where(eq(t.categories.id, p.sourceId));
    return { movedCount: affected.length, restatedPeriods: [] };
  }

  async setCategoryHidden(input: unknown): Promise<unknown> {
    const p = input as { id: string; hidden: boolean };
    // Hiding is not deleting: history stays reconcilable (FR-082).
    await this.db.update(t.categories).set({ isHidden: p.hidden }).where(eq(t.categories.id, p.id));
    return { ok: true };
  }

  // ---- Recurring -----------------------------------------------------------

  /** Rename a merchant everywhere it appears. */
  async renameMerchant(input: unknown): Promise<unknown> {
    const p = input as { merchantKey: string; displayName: string | null };
    if (p.displayName === null || p.displayName.trim() === '') {
      await this.db.delete(t.merchantAliases).where(eq(t.merchantAliases.merchantKey, p.merchantKey));
      return { ok: true };
    }
    await this.db
      .insert(t.merchantAliases)
      .values({
        merchantKey: p.merchantKey,
        displayName: p.displayName,
        createdAt: this.deps.clock.now().toISOString(),
      })
      .onConflictDoUpdate({
        target: t.merchantAliases.merchantKey,
        set: { displayName: p.displayName },
      });
    return { ok: true };
  }

  async listRecurring(): Promise<unknown> {
    const [rows, changes, names] = await Promise.all([
      this.db.select().from(t.recurringCharges),
      this.db.select().from(t.recurringChargeAmountChanges),
      this.merchantDisplayNames(),
    ]);
    return rows.map((r) => ({
      id: r.id,
      merchantKey: r.merchantKey,
      // The name the user sees everywhere else, not the normalized key.
      merchantName: names.get(r.merchantKey) ?? r.merchantKey,
      currentAmountMinor: r.currentAmountMinor,
      cadence: r.cadence,
      firstSeenDate: r.firstSeenDate,
      cumulativePaidMinor: r.cumulativePaidMinor,
      status: r.status,
      amountChanges: changes
        .filter((c) => c.recurringChargeId === r.id)
        .map((c) => ({
          oldAmountMinor: c.oldAmountMinor,
          newAmountMinor: c.newAmountMinor,
          changedAt: c.changedAt,
        })),
    }));
  }

  async acknowledgeRecurring(id: string): Promise<unknown> {
    await this.db
      .update(t.recurringCharges)
      .set({ userAcknowledged: true })
      .where(eq(t.recurringCharges.id, id));
    return { ok: true };
  }

  async markNotRecurring(id: string): Promise<unknown> {
    await this.db
      .update(t.recurringCharges)
      .set({ status: 'inactive' })
      .where(eq(t.recurringCharges.id, id));
    return { ok: true };
  }

  // ---- Alerts and reports --------------------------------------------------

  async listAlerts(): Promise<unknown> {
    const [rows, rules] = await Promise.all([
      this.db.select().from(t.alerts).orderBy(desc(t.alerts.eventOccurredAt)),
      this.db.select().from(t.alertRules),
    ]);
    const byRule = new Map(rules.map((r) => [r.id, r.type]));
    return rows.map((a) => ({
      id: a.id,
      // Falls back to the type captured at fire time, so an alert from a since
      // deleted rule still describes itself.
      type: (a.ruleId ? byRule.get(a.ruleId) : null) ?? a.ruleType,
      // Both surfaced, so a replayed alert is never mistaken for live (FR-057).
      eventOccurredAt: a.eventOccurredAt,
      detectedAt: a.detectedAt,
      dismissed: a.dismissedAsFalsePositive,
    }));
  }

  async dismissAlert(id: string): Promise<unknown> {
    // Dismisses the instance, never the rule (FR-032).
    await this.db
      .update(t.alerts)
      .set({ dismissedAsFalsePositive: true })
      .where(eq(t.alerts.id, id));
    return { ok: true };
  }

  async listAlertRules(): Promise<unknown> {
    return this.db.select().from(t.alertRules);
  }

  async createAlertRule(input: unknown): Promise<unknown> {
    const p = input as {
      type: string;
      label?: string;
      thresholdMinor?: number | null;
      windowMinutes?: number | null;
    };
    const id = `rule_${uuid().slice(0, 8)}`;
    await this.db.insert(t.alertRules).values({
      id,
      type: p.type as 'large_purchase',
      label: p.label ?? null,
      thresholdMinor: p.thresholdMinor ?? null,
      windowMinutes: p.windowMinutes ?? null,
      enabled: true,
      isSystem: false,
    });
    return { id };
  }

  async deleteAlertRule(id: string): Promise<unknown> {
    // Alerts already raised are kept; only the rule stops firing.
    await this.db.delete(t.alertRules).where(eq(t.alertRules.id, id));
    return { ok: true };
  }

  async updateAlertRule(input: unknown): Promise<unknown> {
    const p = input as {
      id: string;
      label?: string | null;
      thresholdMinor?: number | null;
      windowMinutes?: number | null;
      enabled?: boolean;
    };
    await this.db
      .update(t.alertRules)
      .set({
        ...(p.label !== undefined ? { label: p.label } : {}),
        ...(p.thresholdMinor !== undefined ? { thresholdMinor: p.thresholdMinor } : {}),
        ...(p.windowMinutes !== undefined ? { windowMinutes: p.windowMinutes } : {}),
        ...(p.enabled !== undefined ? { enabled: p.enabled } : {}),
      })
      .where(eq(t.alertRules.id, p.id));
    return { ok: true };
  }

  async listReports(): Promise<unknown> {
    const rows = await this.db
      .select()
      .from(t.periodReports)
      .orderBy(desc(t.periodReports.periodStart));
    return rows.map((r) => {
      const content = JSON.parse(r.content) as { totalSpendingMinor?: number; savingsRate?: number };
      return {
        id: r.id,
        type: r.type,
        label: r.label,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        dataComplete: r.dataComplete,
        wasLate: r.wasLate,
        totalSpendingMinor: content.totalSpendingMinor ?? 0,
        savingsRate: content.savingsRate ?? 0,
      };
    });
  }

  /**
   * Generate a report on demand.
   *
   * The scheduled path and this one call exactly the same builders, so a report
   * you force is identical to the one that would have arrived on its own.
   */
  async generateReport(input: unknown): Promise<unknown> {
    const p = input as {
      type: 'weekly_digest' | 'monthly_report' | 'custom';
      asOf?: string;
      periodStart?: string;
      periodEnd?: string;
      label?: string;
    };
    const settings = (await this.getSettings()) as { timeZone: string };
    const asOf = p.asOf ? new Date(p.asOf) : this.deps.clock.now();

    // A custom report uses the exact range the user asked for; the scheduled
    // kinds snap to a period boundary.
    const range =
      p.type === 'custom'
        ? { start: new Date(p.periodStart ?? ''), end: new Date(p.periodEnd ?? '') }
        : p.type === 'monthly_report'
          ? monthBoundaries(asOf, settings.timeZone)
          : weekBoundaries(asOf, settings.timeZone);

    if (Number.isNaN(range.start.getTime()) || Number.isNaN(range.end.getTime())) {
      throw new IpcFailure('VALIDATION_FAILED', 'That date range is not valid', false);
    }
    if (range.end.getTime() <= range.start.getTime()) {
      throw new IpcFailure('VALIDATION_FAILED', 'The end date must be after the start date', false);
    }

    const [transactions, completeness, recurring] = await Promise.all([
      this.spendingIn(range.start.toISOString(), range.end.toISOString()),
      this.completeness(),
      this.db.select().from(t.recurringCharges),
    ]);

    // Compare against the immediately preceding window of the same length.
    const priorRange =
      p.type === 'custom'
        ? {
            start: new Date(range.start.getTime() - (range.end.getTime() - range.start.getTime())),
            end: range.start,
          }
        : p.type === 'monthly_report'
          ? monthBoundaries(new Date(range.start.getTime() - 1), settings.timeZone)
          : weekBoundaries(new Date(range.start.getTime() - 1), settings.timeZone);
    const priorBreakdown = breakdownByCategory(
      await this.spendingIn(priorRange.start.toISOString(), priorRange.end.toISOString()),
    );
    const priorPeriodTotals: Record<string, number> = {};
    for (const row of priorBreakdown.rows) priorPeriodTotals[row.categoryId] = row.totalMinor;

    const reportInput = {
      periodStart: range.start,
      periodEnd: range.end,
      categoryNames: Object.fromEntries(await this.categoryNames()),
      categoryParents: Object.fromEntries(await this.categoryParents()),
      transactions,
      priorPeriodTotals,
      baselinesByCategory: await this.baselines(
        settings.timeZone,
        p.type === 'weekly_digest' ? 'weekly_digest' : 'monthly_report',
      ),
      recurringCharges: recurring.map((r) => ({
        merchantKey: r.merchantKey,
        currentAmountMinor: r.currentAmountMinor,
        cadence: r.cadence,
        cumulativePaidMinor: r.cumulativePaidMinor,
      })),
      dataComplete: completeness.dataComplete,
      staleInstitutions: completeness.staleInstitutions,
    };

    const content =
      p.type === 'weekly_digest' ? buildWeeklyDigest(reportInput) : buildMonthlyReport(reportInput);

    const id = `rep_${uuid().slice(0, 8)}`;
    await this.db
      .insert(t.periodReports)
      .values({
        id,
        type: p.type,
        label: p.label ?? null,
        periodStart: range.start.toISOString(),
        periodEnd: range.end.toISOString(),
        content: JSON.stringify(content),
        generatedAt: this.deps.clock.now().toISOString(),
        deliveredAt: null,
        // Generated on request rather than on schedule, so not "late".
        wasLate: false,
        dataComplete: completeness.dataComplete,
      })
      .onConflictDoNothing();

    return { id, type: p.type, content };
  }

  /** Per-category baselines from the user's own prior periods (FR-039). */
  private async baselines(
    timeZone: string,
    type: 'weekly_digest' | 'monthly_report',
  ): Promise<Record<string, ReturnType<typeof computeBaseline>>> {
    const periods = type === 'monthly_report' ? 6 : 8;
    const totalsByCategory = new Map<string, number[]>();
    let cursor = this.deps.clock.now();

    for (let i = 0; i < periods; i += 1) {
      const range =
        type === 'monthly_report'
          ? monthBoundaries(cursor, timeZone)
          : weekBoundaries(cursor, timeZone);
      const breakdown = breakdownByCategory(
        await this.spendingIn(range.start.toISOString(), range.end.toISOString()),
      );
      for (const row of breakdown.rows) {
        totalsByCategory.set(row.categoryId, [
          ...(totalsByCategory.get(row.categoryId) ?? []),
          row.totalMinor,
        ]);
      }
      cursor = new Date(range.start.getTime() - 1);
    }

    const out: Record<string, ReturnType<typeof computeBaseline>> = {};
    for (const [categoryId, totals] of totalsByCategory) {
      out[categoryId] = computeBaseline(totals);
    }
    return out;
  }

  async deleteReport(id: string): Promise<unknown> {
    await this.db.delete(t.periodReports).where(eq(t.periodReports.id, id));
    return { ok: true };
  }

  async getReport(id: string): Promise<unknown> {
    const rows = await this.db.select().from(t.periodReports).where(eq(t.periodReports.id, id));
    const row = rows[0];
    if (!row) throw new IpcFailure('INTERNAL', 'Report not found', false);
    return { ...row, content: JSON.parse(row.content) };
  }

  // ---- Diagnostics, settings, data -----------------------------------------

  async health(): Promise<unknown> {
    const [events, institutions, transactions] = await Promise.all([
      this.db.select().from(t.diagnosticEvents).orderBy(desc(t.diagnosticEvents.occurredAt)).limit(1000),
      this.db.select().from(t.institutions),
      this.db.select().from(t.transactions),
    ]);
    const summary = summarizeHealth(events.map((e) => this.toDiagnosticEvent(e)));

    // What is actually stored, so an empty screen can be told apart from a
    // broken one. "The dashboard is blank" has two very different causes:
    // nothing was ever imported, or everything imported sits in an account the
    // user excluded from day-to-day money.
    const [accounts, categorizations] = await Promise.all([
      this.db.select().from(t.accounts),
      this.db.select().from(t.categorizations).where(isNull(t.categorizations.supersededBy)),
    ]);
    const everydayIds = new Set(accounts.filter((a) => a.isEveryday).map((a) => a.id));
    const now = this.deps.clock.now();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    return {
      contents: {
        institutions: institutions.length,
        accounts: accounts.length,
        everydayAccounts: everydayIds.size,
        transactions: transactions.length,
        transactionsInEverydayAccounts: transactions.filter((r) => everydayIds.has(r.accountId))
          .length,
        transactionsThisMonth: transactions.filter(
          (r) => r.postedDate >= monthStart && everydayIds.has(r.accountId),
        ).length,
        categorized: categorizations.filter((c) => c.categoryId !== UNCATEGORIZABLE).length,
        uncategorizable: categorizations.filter((c) => c.categoryId === UNCATEGORIZABLE).length,
      },
      perAccount: institutions.map((i) => ({
        institutionId: i.id,
        institutionName: i.institutionName,
        status: i.status,
        lastSuccessfulSync: i.lastSyncedAt,
        lastAttemptedSync: i.lastAttemptedSyncAt,
        recentFailures: summary.failuresBySubject[i.id] ?? 0,
      })),
      metrics: {
        syncDurationMsP50: this.medianDuration(events),
        transactionsProcessed: transactions.length,
        localResolutionRate: await this.localResolutionRate(),
        droppedDiagnosticEvents: this.deps.logger.droppedEventCount,
      },
    };
  }

  async exportDiagnostics(destPath: string): Promise<unknown> {
    const events = await this.db.select().from(t.diagnosticEvents);
    const payload = buildExport(
      events.map((e) => this.toDiagnosticEvent(e)),
      { droppedEventCount: this.deps.logger.droppedEventCount },
    );
    const target = destPath || (await this.chooseSavePath('money-diagnostics.json'));
    if (!target) return { ok: false };
    writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
    return { ok: true, path: target, eventCount: payload.eventCount };
  }

  async getSettings(): Promise<unknown> {
    const rows = await this.db.select().from(t.settings);
    const map = new Map(rows.filter((r) => !r.isSecret).map((r) => [r.key, r.value]));
    const num = (key: string): number | undefined =>
      map.has(key) ? Number(map.get(key)) : undefined;
    return mergeSettings(DEFAULT_SETTINGS, {
      ...(num('confidenceThreshold') !== undefined
        ? { confidenceThreshold: num('confidenceThreshold') as number }
        : {}),
      ...(num('pollIntervalMinutes') !== undefined
        ? { pollIntervalMinutes: num('pollIntervalMinutes') as number }
        : {}),
      ...(map.has('categorizationMode')
        ? { categorizationMode: map.get('categorizationMode') as 'hybrid' | 'local_only' }
        : {}),
      ...(map.has('modelProvider')
        ? { modelProvider: map.get('modelProvider') as AppSettings['modelProvider'] }
        : {}),
      ...(map.has('anthropicModel') ? { anthropicModel: map.get('anthropicModel') as string } : {}),
      ...(map.has('anthropicWorkspaceId')
        ? { anthropicWorkspaceId: map.get('anthropicWorkspaceId') as string }
        : {}),
      ...(map.has('ollamaModel') ? { ollamaModel: map.get('ollamaModel') as string } : {}),
      ...(map.has('ollamaBaseUrl') ? { ollamaBaseUrl: map.get('ollamaBaseUrl') as string } : {}),
      ...(map.has('timeZone') ? { timeZone: map.get('timeZone') as string } : {}),
    });
  }

  async updateSettings(input: unknown): Promise<unknown> {
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (value !== undefined) await this.upsertSetting(key, String(value), false);
    }
    return { ok: true };
  }

  async exportData(destPath: string): Promise<unknown> {
    const target = destPath || (await this.chooseDirectory());
    if (!target) return { ok: false };
    const result = exportBackup(this.deps.handle, this.deps.userDataDir, target);
    return { ok: true, path: result.databasePath };
  }

  async importData(srcPath: string): Promise<unknown> {
    const source = srcPath || (await this.chooseDirectory());
    if (!source) return { ok: false };
    restoreBackup(source, this.deps.userDataDir);
    // The connection holds the old file; a restart is required for the restore
    // to take effect. Saying so beats silently showing stale data.
    return { ok: true, restored: true, requiresRestart: true };
  }

  async deleteAllData(): Promise<unknown> {
    this.deps.handle.close();
    deleteAllData(this.deps.userDataDir);
    return { ok: true, requiresRestart: true };
  }

  /** Installed Ollama models, for the settings picker. Empty when Ollama is off. */
  async listOllamaModels(): Promise<unknown> {
    const baseUrl = (await this.readPlainSetting('ollamaBaseUrl')) ?? undefined;
    try {
      return await listOllamaModels(baseUrl);
    } catch {
      // Ollama not running is a normal state, not an error to surface.
      return [];
    }
  }

  /**
   * Rebuild the recurring-charge and income ledgers from stored transactions.
   *
   * Run after every sync and on demand. Both ledgers are derived data, so this
   * recomputes rather than incrementally patches — which is what keeps them
   * correct after a correction, a backfill, or a late-arriving transaction.
   */
  async refreshAnalysis(): Promise<unknown> {
    const [transactions, existingRecurringRows, existingIncomeRows] = await Promise.all([
      this.db.select().from(t.transactions),
      this.db.select().from(t.recurringCharges),
      this.db.select().from(t.incomeSources),
    ]);

    const result = runAnalysisPass({
      asOf: this.deps.clock.now(),
      transactions: transactions.map((r) => ({
        id: r.id,
        accountId: r.accountId,
        merchantKey: r.merchantKey,
        amountMinor: r.amountMinor,
        postedDate: r.postedDate,
        datetime: r.datetime,
        isInternalTransfer: r.isInternalTransfer,
        settlementState: r.settlementState,
        userRecurringOverride: r.userRecurringOverride,
      })),
      existingRecurring: existingRecurringRows.map((r) => ({
        id: r.id,
        merchantKey: r.merchantKey,
        currentAmountMinor: r.currentAmountMinor,
        cadence: r.cadence,
        firstSeenDate: new Date(r.firstSeenDate),
        lastSeenDate: new Date(r.lastSeenDate),
        cumulativePaidMinor: r.cumulativePaidMinor,
        status: r.status,
        userAcknowledged: r.userAcknowledged,
      })),
      existingIncome: existingIncomeRows.map((r) => ({
        id: r.id,
        accountId: r.accountId,
        merchantKey: r.merchantKey,
        expectedAmountMinor: r.expectedAmountMinor,
        cadence: r.cadence,
        nextExpectedDate: new Date(r.nextExpectedDate),
        detectionConfidence: r.detectionConfidence,
        isUserConfirmed: r.isUserConfirmed,
        isActive: r.isActive,
      })),
    });

    const now = this.deps.clock.now().toISOString();
    const acknowledged = new Set(
      existingRecurringRows.filter((r) => r.userAcknowledged).map((r) => r.merchantKey),
    );
    const priorAmounts = new Map(
      existingRecurringRows.map((r) => [r.merchantKey, r.currentAmountMinor]),
    );

    for (const charge of result.recurring) {
      const id = `rc_${charge.merchantKey}`;
      await this.db
        .insert(t.recurringCharges)
        .values({
          id,
          merchantKey: charge.merchantKey,
          currentAmountMinor: charge.currentAmountMinor,
          cadence: charge.cadence as 'monthly',
          firstSeenDate: charge.firstSeenDate.toISOString().slice(0, 10),
          lastSeenDate: charge.lastSeenDate.toISOString().slice(0, 10),
          cumulativePaidMinor: charge.cumulativePaidMinor,
          status: 'active',
          detectedAt: now,
          userAcknowledged: acknowledged.has(charge.merchantKey),
        })
        .onConflictDoUpdate({
          target: t.recurringCharges.id,
          set: {
            currentAmountMinor: charge.currentAmountMinor,
            lastSeenDate: charge.lastSeenDate.toISOString().slice(0, 10),
            cumulativePaidMinor: charge.cumulativePaidMinor,
            status: 'active',
          },
        });

      // Record a price change once, not on every pass.
      const prior = priorAmounts.get(charge.merchantKey);
      if (prior !== undefined && prior !== charge.currentAmountMinor) {
        await this.db.insert(t.recurringChargeAmountChanges).values({
          id: `ac_${uuid().slice(0, 8)}`,
          recurringChargeId: id,
          oldAmountMinor: prior,
          newAmountMinor: charge.currentAmountMinor,
          changedAt: now,
        });
      }
    }

    for (const stopped of result.deactivated) {
      await this.db
        .update(t.recurringCharges)
        .set({ status: 'inactive' })
        .where(eq(t.recurringCharges.id, stopped.id));
    }

    for (const source of result.income) {
      await this.db
        .insert(t.incomeSources)
        .values({
          id: `inc_${source.merchantKey}`,
          accountId: source.accountId,
          merchantKey: source.merchantKey,
          expectedAmountMinor: source.expectedAmountMinor,
          cadence: source.cadence,
          nextExpectedDate: source.nextExpectedDate.toISOString(),
          detectionConfidence: source.detectionConfidence,
          isUserConfirmed: source.isUserConfirmed,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: t.incomeSources.id,
          // A confirmed source keeps its pinned values (FR-071).
          set: source.isUserConfirmed
            ? { isActive: true }
            : {
                expectedAmountMinor: source.expectedAmountMinor,
                cadence: source.cadence,
                nextExpectedDate: source.nextExpectedDate.toISOString(),
                detectionConfidence: source.detectionConfidence,
                isActive: true,
              },
        });
    }

    return {
      recurringCount: result.recurring.length,
      newlyDetected: result.newlyDetected.length,
      amountChanges: result.amountChanges.length,
      incomeCount: result.income.length,
    };
  }

  /**
   * Actually call the configured model and report what happened.
   *
   * The pipeline degrades to local heuristics when the model errors, which is
   * correct for ingestion but means a misconfigured key looks identical to a
   * working one. This is the button that tells the user which it is.
   */
  /** How categorization is configured right now. Makes no network call. */
  async modelStatus(): Promise<unknown> {
    return this.deps.describeModel();
  }

  async testModel(): Promise<unknown> {
    const description = await this.deps.describeModel();
    if (description.localOnly) {
      return { ok: false, ...description, message: description.reason };
    }

    const pipeline = await this.deps.buildPipeline();
    const result = await pipeline.categorize({
      // A descriptor with no history and no heuristic match, so the model stage
      // is genuinely exercised rather than short-circuited.
      transactionId: 'model-test',
      descriptor: 'ZZQX TEST MERCHANT 4417',
      amountMinor: -1234,
      occurredAt: this.deps.clock.now(),
    });

    if (pipeline.lastModelError) {
      return { ok: false, ...description, message: explainModelError(pipeline.lastModelError) };
    }
    if (result.source !== 'model') {
      return {
        ok: false,
        ...description,
        message: 'The model was not reached and no error was reported.',
      };
    }
    return {
      ok: true,
      ...description,
      message: `${description.model ?? description.provider} answered: ${result.categoryId}`,
    };
  }

  /**
   * Run the model over transactions that never got a real answer.
   *
   * Anything imported while no model was configured was categorized by
   * heuristics and would otherwise stay that way forever, because the model
   * only ever runs at ingestion time.
   */
  async recategorizePending(input?: unknown): Promise<unknown> {
    const scope = (input as { scope?: 'unresolved' | 'all' } | undefined)?.scope ?? 'unresolved';
    const description = await this.deps.describeModel();
    if (description.localOnly) {
      return { ok: false, examined: 0, changed: 0, message: description.reason };
    }

    const [rows, live] = await Promise.all([
      this.db.select().from(t.transactions),
      this.liveCategorizations(),
    ]);

    // A category the user set is never overwritten by a model, whatever the
    // scope. Their correction is the whole point of having made it.
    const targets = rows.filter((r) => {
      const current = live.get(r.id);
      if (current?.source === 'user') return false;
      if (scope === 'all') return true;
      return !current || current.categoryId === UNCATEGORIZABLE || current.needsReview;
    });

    const pipeline = await this.deps.buildPipeline();
    const at = this.deps.clock.now().toISOString();
    let changed = 0;
    let stoppedEarly = false;

    for (const row of targets) {
      const result = await pipeline.categorize({
        transactionId: row.id,
        descriptor: row.merchantName ?? row.description,
        amountMinor: row.amountMinor,
        occurredAt: new Date(row.datetime ?? `${row.postedDate}T12:00:00Z`),
      });

      // Accept a learned answer too, not only a fresh model call: once this run
      // has seen a merchant enough times the pipeline resolves it from that
      // history, and skipping those would leave repeat merchants untouched.
      if (result.categoryId !== UNCATEGORIZABLE) {
        await this.replaceCategorization(row.id, result, at);
        changed += 1;
      }

      // A bad key or a down endpoint should not mean one failed request per
      // transaction. Stop and say so.
      if (pipeline.modelFailures >= MODEL_FAILURE_LIMIT) {
        stoppedEarly = true;
        break;
      }
    }

    const scopeLabel = scope === 'all' ? 'transactions' : 'unresolved transactions';
    const message = stoppedEarly
      ? `Stopped after ${pipeline.modelFailures} model failures. Recategorized ${changed} of ${targets.length} ${scopeLabel}. Last error: ${explainModelError(pipeline.lastModelError)}`
      : pipeline.lastModelError
        ? `Recategorized ${changed} of ${targets.length} ${scopeLabel}. The model failed on ${pipeline.modelFailures}: ${explainModelError(pipeline.lastModelError)}`
        : `Recategorized ${changed} of ${targets.length} ${scopeLabel}.`;

    return {
      ok: pipeline.lastModelError === null,
      examined: targets.length,
      changed,
      modelFailures: pipeline.modelFailures,
      stoppedEarly,
      message,
    };
  }

  /**
   * Every override the user has made, in one list.
   *
   * A rename or an exclusion set months ago is otherwise invisible until it
   * turns up wrong in a report, with no way to find what caused it.
   */
  async listOverrides(): Promise<unknown> {
    const [aliases, profiles, transactions, categorizations, categoryNames] = await Promise.all([
      this.db.select().from(t.merchantAliases),
      this.db.select().from(t.merchantProfiles),
      this.db.select().from(t.transactions),
      this.liveCategorizations(),
      this.categoryNames(),
    ]);

    const byMerchant = new Map<string, TransactionRow[]>();
    for (const row of transactions) {
      if (!row.merchantKey) continue;
      const list = byMerchant.get(row.merchantKey) ?? [];
      list.push(row);
      byMerchant.set(row.merchantKey, list);
    }
    const bankName = (merchantKey: string): string | null =>
      byMerchant.get(merchantKey)?.[0]?.merchantName ?? null;

    const out: OverrideRecord[] = [];

    for (const alias of aliases) {
      out.push({
        id: `merchant_name:${alias.merchantKey}`,
        kind: 'merchant_name',
        target: alias.merchantKey,
        label: alias.displayName,
        original: bankName(alias.merchantKey),
        current: alias.displayName,
        affectedCount: byMerchant.get(alias.merchantKey)?.length ?? 0,
        occurredAt: alias.createdAt,
      });
    }

    for (const profile of profiles) {
      if (!profile.userConfirmedCategoryId) continue;
      out.push({
        id: `merchant_category:${profile.merchantKey}`,
        kind: 'merchant_category',
        target: profile.merchantKey,
        label:
          aliases.find((a) => a.merchantKey === profile.merchantKey)?.displayName ??
          bankName(profile.merchantKey) ??
          profile.merchantKey,
        original: null,
        current:
          categoryNames.get(profile.userConfirmedCategoryId) ?? profile.userConfirmedCategoryId,
        affectedCount: byMerchant.get(profile.merchantKey)?.length ?? 0,
        occurredAt: profile.lastUpdatedAt,
      });
    }

    const aliasMap = new Map(aliases.map((a) => [a.merchantKey, a.displayName]));
    for (const row of transactions) {
      const name = resolveMerchantName(row, aliasMap);

      if (row.userMerchantName) {
        out.push({
          id: `transaction_name:${row.id}`,
          kind: 'transaction_name',
          target: row.id,
          label: name,
          original: row.merchantName ?? row.description,
          current: row.userMerchantName,
          affectedCount: 1,
          occurredAt: row.postedDate,
        });
      }
      if (row.userExcluded) {
        out.push({
          id: `excluded:${row.id}`,
          kind: 'excluded',
          target: row.id,
          label: name,
          original: 'Counted',
          current: 'Excluded from totals',
          affectedCount: 1,
          occurredAt: row.postedDate,
        });
      }
      if (row.userRecurringOverride) {
        out.push({
          id: `recurring:${row.id}`,
          kind: 'recurring',
          target: row.id,
          label: name,
          original: 'Detected automatically',
          current: row.userRecurringOverride === 'recurring' ? 'Recurring' : 'Not recurring',
          affectedCount: 1,
          occurredAt: row.postedDate,
        });
      }
      if (row.userNote) {
        out.push({
          id: `note:${row.id}`,
          kind: 'note',
          target: row.id,
          label: name,
          original: null,
          current: row.userNote,
          affectedCount: 1,
          occurredAt: row.postedDate,
        });
      }

      const live = categorizations.get(row.id);
      if (live?.source === 'user') {
        out.push({
          id: `transaction_category:${row.id}`,
          kind: 'transaction_category',
          target: row.id,
          label: name,
          original: null,
          current: categoryNames.get(live.categoryId) ?? live.categoryId,
          affectedCount: 1,
          occurredAt: live.createdAt,
        });
      }
    }

    // Newest first: a mistake is usually a recent one.
    out.sort((a, b) => (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''));
    return out;
  }

  /** Undo one override, putting that decision back in the app's hands. */
  async clearOverride(input: unknown): Promise<unknown> {
    const p = input as { kind: OverrideKind; target: string };
    switch (p.kind) {
      case 'merchant_name':
        await this.db
          .delete(t.merchantAliases)
          .where(eq(t.merchantAliases.merchantKey, p.target));
        break;
      case 'merchant_category':
        await this.db
          .update(t.merchantProfiles)
          .set({ userConfirmedCategoryId: null })
          .where(eq(t.merchantProfiles.merchantKey, p.target));
        break;
      case 'transaction_name':
        await this.db
          .update(t.transactions)
          .set({ userMerchantName: null })
          .where(eq(t.transactions.id, p.target));
        break;
      case 'excluded':
        await this.db
          .update(t.transactions)
          .set({ userExcluded: false })
          .where(eq(t.transactions.id, p.target));
        break;
      case 'recurring':
        await this.db
          .update(t.transactions)
          .set({ userRecurringOverride: null })
          .where(eq(t.transactions.id, p.target));
        break;
      case 'note':
        await this.db
          .update(t.transactions)
          .set({ userNote: null })
          .where(eq(t.transactions.id, p.target));
        break;
      case 'transaction_category':
        await this.revertCategorization(p.target);
        break;
    }
    return { ok: true };
  }

  /**
   * Drop the user's categorization and restore what it replaced.
   *
   * The chain is an audit record, so the correction is removed and its
   * predecessor becomes live again rather than a third row being appended.
   */
  private async revertCategorization(transactionId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(t.categorizations)
      .where(eq(t.categorizations.transactionId, transactionId));
    const live = rows.find((r) => r.supersededBy === null);
    if (!live || live.source !== 'user') return;

    const previous = rows.find((r) => r.supersededBy === live.id);
    if (previous) {
      await this.db
        .update(t.categorizations)
        .set({ supersededBy: null })
        .where(eq(t.categorizations.id, previous.id));
    }
    await this.db.delete(t.categorizations).where(eq(t.categorizations.id, live.id));
  }

  async syncNow(): Promise<unknown> {
    const outcome = await this.deps.sync();
    const summary = summarizeSync(outcome);
    if (!summary.ok) {
      // A sync that fetched nothing because it could not reach Plaid is a
      // failure, and it is told to the user as one. Returning quietly here is
      // what made "Sync now" look like it did nothing.
      throw new IpcFailure(
        outcome.blocked ? 'PLAID_UNCONFIGURED' : 'SYNC_FAILED',
        summary.message,
        true,
        outcome.blocked ? 'Open Settings' : 'Try again',
      );
    }
    await this.refreshAnalysis();
    return { ...outcome, message: summary.message, warning: summary.warning };
  }

  // ---- Internals -----------------------------------------------------------

  private countsAsSpending(r: TransactionRow): boolean {
    return (
      !r.isInternalTransfer &&
      !r.userExcluded &&
      r.settlementState !== 'removed' &&
      r.amountMinor < 0
    );
  }

  private namedRows(
    breakdown: ReturnType<typeof breakdownByCategory>,
    names: Map<string, string>,
    parents: Map<string, string | null> = new Map(),
  ): { rows: unknown[]; totalMinor: number } {
    return {
      rows: breakdown.rows.map((r) => {
        const parentId = parents.get(r.categoryId) ?? null;
        return {
          categoryId: r.categoryId,
          name: names.get(r.categoryId) ?? r.categoryId,
          // Supplied so the dashboard can roll spending up to the parent.
          parentId,
          parentName: parentId ? (names.get(parentId) ?? parentId) : null,
          totalMinor: r.totalMinor,
          txCount: r.transactionCount,
        };
      }),
      totalMinor: breakdown.totalMinor,
    };
  }

  /** categoryId -> parentId, for rolling a breakdown up one level. */
  private async categoryParents(): Promise<Map<string, string | null>> {
    const rows = await this.db.select().from(t.categories);
    return new Map(rows.map((r) => [r.id, r.parentId]));
  }

  private async runway(): Promise<unknown> {
    const [sources, accounts] = await Promise.all([
      this.db.select().from(t.incomeSources),
      this.db.select().from(t.accounts),
    ]);
    const currentBalanceMinor = accounts
      .filter((a) => a.isEveryday)
      .reduce((a, x) => a + (x.currentBalanceMinor ?? 0), 0);

    const projection = projectBalance({
      currentBalanceMinor,
      dailyBurnMinor: await this.dailyBurn(),
      asOf: this.deps.clock.now(),
      incomeSources: sources.map((s) => ({
        id: s.id,
        accountId: s.accountId,
        merchantKey: s.merchantKey,
        expectedAmountMinor: s.expectedAmountMinor,
        cadence: s.cadence,
        nextExpectedDate: new Date(s.nextExpectedDate),
        detectionConfidence: s.detectionConfidence,
        isUserConfirmed: s.isUserConfirmed,
        isActive: s.isActive,
      })),
      floorMinor: BALANCE_FLOOR_MINOR,
    });

    return {
      available: projection.available,
      currentBalanceMinor,
      projectedMinor: projection.projectedMinor,
      floorMinor: BALANCE_FLOOR_MINOR,
      nextIncomeDate: projection.nextIncomeDate?.toISOString() ?? null,
      reason: projection.reason,
    };
  }

  private async dailyBurn(): Promise<number> {
    const everydayIds = await this.everydayAccountIds();
    const rows = this.everyday(await this.db.select().from(t.transactions), everydayIds);
    const cutoff = new Date(this.deps.clock.now().getTime() - BURN_WINDOW_DAYS * 86_400_000);
    const recent = rows.filter((r) => new Date(r.postedDate) >= cutoff && this.countsAsSpending(r));
    if (recent.length === 0) return 0;
    return Math.round(Math.abs(recent.reduce((a, r) => a + r.amountMinor, 0)) / BURN_WINDOW_DAYS);
  }

  private async spendingIn(start: string, end: string): Promise<SpendingTransaction[]> {
    const [allRows, live, everydayIds] = await Promise.all([
      this.transactionsIn(start, end),
      this.liveCategorizations(),
      this.everydayAccountIds(),
    ]);
    const rows = this.everyday(allRows, everydayIds);
    return rows.map((r) => ({
      id: r.id,
      amountMinor: r.amountMinor,
      categoryId: live.get(r.id)?.categoryId ?? UNCATEGORIZABLE,
      settlementState: r.settlementState,
      isInternalTransfer: r.isInternalTransfer,
      reversesTransactionId: r.reversesTransactionId,
      userExcluded: r.userExcluded,
    }));
  }

  private async transactionsIn(start?: string, end?: string): Promise<TransactionRow[]> {
    if (!start || !end) return this.db.select().from(t.transactions);
    return this.db
      .select()
      .from(t.transactions)
      .where(
        and(
          gte(t.transactions.postedDate, start.slice(0, 10)),
          lte(t.transactions.postedDate, end.slice(0, 10)),
        ),
      );
  }

  /** Accounts that count as day-to-day money. Savings is deliberately excluded. */
  private async everydayAccountIds(): Promise<Set<string>> {
    const rows = await this.db.select().from(t.accounts);
    return new Set(rows.filter((a) => a.isEveryday).map((a) => a.id));
  }

  /**
   * Restrict to everyday accounts.
   *
   * Money sitting in savings is not spending money: including it would inflate
   * every category total and make the runway claim a balance the user is not
   * actually spending from.
   */
  private everyday<T extends { accountId: string }>(
    rows: readonly T[],
    everydayIds: ReadonlySet<string>,
  ): T[] {
    return rows.filter((r) => everydayIds.has(r.accountId));
  }

  private async liveCategorizations(): Promise<Map<string, CategorizationRecord & { reasoning: string | null }>> {
    const rows = await this.db
      .select()
      .from(t.categorizations)
      .where(isNull(t.categorizations.supersededBy));
    return new Map(rows.map((r) => [r.transactionId, r]));
  }

  private async categorizationRecords(): Promise<CategorizationRecord[]> {
    return this.db.select().from(t.categorizations);
  }

  private async transactionIdsForMerchant(merchantKey: string): Promise<string[]> {
    const rows = await this.db
      .select()
      .from(t.transactions)
      .where(eq(t.transactions.merchantKey, merchantKey));
    return rows.map((r) => r.id);
  }

  /** Append a correction to the chain; never overwrite (data-model.md). */
  /** Record a model answer over the current one, keeping the audit chain. */
  private async replaceCategorization(
    transactionId: string,
    result: { categoryId: string; confidence: number; needsReview: boolean; reasoning: string },
    at: string,
  ): Promise<void> {
    const current = liveCategorization(await this.categorizationRecords(), transactionId);
    const id = `cat_${randomUUID().slice(0, 12)}`;
    await this.db.insert(t.categorizations).values({
      id,
      transactionId,
      categoryId: result.categoryId,
      confidence: result.confidence,
      source: 'model',
      isConfirmed: false,
      needsReview: result.needsReview,
      reasoning: result.reasoning,
      supersededBy: null,
      createdAt: at,
    });
    if (current) {
      await this.db
        .update(t.categorizations)
        .set({ supersededBy: id })
        .where(eq(t.categorizations.id, current.id));
    }
  }

  private async supersede(transactionId: string, categoryId: string, at: string): Promise<void> {
    const current = liveCategorization(await this.categorizationRecords(), transactionId);
    const id = `cat_${randomUUID().slice(0, 12)}`;
    await this.db.insert(t.categorizations).values({
      id,
      transactionId,
      categoryId,
      confidence: 1,
      source: 'user',
      isConfirmed: true,
      needsReview: false,
      reasoning: null,
      supersededBy: null,
      createdAt: at,
    });
    if (current) {
      await this.db
        .update(t.categorizations)
        .set({ supersededBy: id })
        .where(eq(t.categorizations.id, current.id));
    }
  }

  /** merchantKey -> user display name (FR-016-style merchant-wide override). */
  private async merchantAliases(): Promise<Map<string, string>> {
    const rows = await this.db.select().from(t.merchantAliases);
    return new Map(rows.map((r) => [r.merchantKey, r.displayName]));
  }

  /**
   * Best display name per merchant key.
   *
   * Precedence matches the register: a user alias, then a per-transaction
   * rename, then whatever the bank sent. A normalized key like "uber eats" is
   * an internal identifier and should never be what the user reads.
   */
  private async merchantDisplayNames(): Promise<Map<string, string>> {
    const [aliases, transactions] = await Promise.all([
      this.merchantAliases(),
      this.db.select().from(t.transactions),
    ]);
    const names = new Map<string, string>();
    for (const tx of transactions) {
      if (!tx.merchantKey || names.has(tx.merchantKey)) continue;
      // Always resolvable: the descriptor is the last resort, so these lists can
      // never fall back to showing the normalized merchant key.
      names.set(tx.merchantKey, resolveMerchantName(tx, aliases));
    }
    // A merchant-wide rename is the user's answer for the whole merchant, so it
    // wins over any single transaction's name in a per-merchant list.
    for (const [key, alias] of aliases) names.set(key, alias);
    return names;
  }

  private async categoryNames(): Promise<Map<string, string>> {
    const rows = await this.db.select().from(t.categories);
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private async localResolutionRate(): Promise<number | null> {
    const rows = await this.db.select().from(t.categorizations);
    if (rows.length === 0) return null;
    return rows.filter((r) => r.source === 'local_history').length / rows.length;
  }

  private medianDuration(events: Array<{ durationMs: number | null }>): number | null {
    const durations = events.flatMap((e) => (e.durationMs === null ? [] : [e.durationMs])).sort((a, b) => a - b);
    return durations.length === 0 ? null : (durations[Math.floor(durations.length / 2)] ?? null);
  }

  private toDiagnosticEvent(e: typeof t.diagnosticEvents.$inferSelect): Parameters<typeof summarizeHealth>[0][number] {
    return {
      occurredAt: e.occurredAt,
      type: e.eventType as never,
      outcome: e.outcome as never,
      subjectId: e.subjectId ?? undefined,
      durationMs: e.durationMs ?? undefined,
      errorCode: (e.errorCode ?? undefined) as never,
    };
  }

  private async upsertSetting(key: string, value: string, isSecret: boolean): Promise<void> {
    await this.db
      .insert(t.settings)
      .values({ key, value, isSecret })
      .onConflictDoUpdate({ target: t.settings.key, set: { value, isSecret } });
  }

  private async chooseSavePath(defaultName: string): Promise<string | null> {
    const result = await dialog.showSaveDialog({
      defaultPath: join(app.getPath('downloads'), defaultName),
    });
    return result.canceled ? null : (result.filePath ?? null);
  }

  private async chooseDirectory(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  }
}

/** Opens the Hosted Link URL in the system browser (research.md R1). */
export async function openHostedLink(url: string): Promise<void> {
  await shell.openExternal(url);
}
