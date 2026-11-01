import { app, dialog, shell } from 'electron';
import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as t from '@main/db/schema';
import type { DatabaseHandle } from '@main/db/client';
import type { AppServices } from '@main/ipc/handlers/services';
import { IpcFailure } from '@main/ipc/registry';
import { assessCompleteness, type Completeness, type InstitutionState } from '@main/plaid/health';
import { breakdownByCategory, spendingTotalMinor } from '@main/analysis/spending';
import { projectBalance } from '@main/analysis/income';
import {
  daysUntil,
  monthlyTotals,
  monthRange,
  periodSpan,
  periodTotals,
  recurringSeries,
  type DashboardPeriod,
  MONTHS_SHOWN,
  runwaySeries,
  safeToSpendPerDayMinor,
  spendByGroup,
  type DatedTransaction,
  type Runway,
} from '@main/analysis/dashboard-kpis';
import {
  monthlyCostMinor,
  nextExpectedDate,
  upcomingCharges,
  yearlyCostMinor,
} from '@main/analysis/recurring-schedule';
import {
  dailySpending,
  reportHeadline,
  reportSpentMinor,
  reportSummary,
  type PriceChange,
  type StoredContent,
} from '@main/reports/headline';
import { kpiSeries, presentReportContent, reportPdfName } from '@main/reports/detail';
import { categorySpend } from '@main/categories/spend';
import { suggestCategoryIds } from '@main/categorization/suggestions';
import { syncHistory } from '@main/diagnostics/sync-history';
import { buildMonthlyReport, buildWeeklyDigest } from '@main/analysis/reports';
import { runAnalysisPass } from '@main/analysis/pass';
import { findRecurringCandidates } from '@main/analysis/recurring-candidates';
import { monthBoundaries, weekBoundaries } from '@shared/periods';
import { computeBaseline } from '@main/analysis/baselines';
import type { CategorizationPipeline } from '@main/categorization/pipeline';
import { createCategory, mergeCategories, type Category } from '@main/categories/manage';
import {
  applyRuleCategory,
  deleteRule,
  listRules,
  setMerchantName,
  setRuleCategory,
  supersedeCategorization,
} from '@main/categories/rules';
import { liveCategorization, planRetroactive } from '@main/categorization/corrections';
import type { CategorizationRecord } from '@main/categorization/corrections';
import { buildExport, summarizeHealth } from '@main/diagnostics/export';
import type { DiagnosticLogger } from '@main/diagnostics/logger';
import { DEFAULT_SETTINGS, mergeSettings } from '@main/settings/index';
import { UsageRecorder } from '@main/usage/recorder';
import { recentUsage, usageCsv, usageSummary } from '@main/usage/queries';
import { deleteAllData, exportBackup, restoreBackup } from '@main/data/backup';
import {
  accessTokenAccount,
  CREDENTIAL_ACCOUNTS,
  DATABASE_KEY_ACCOUNT,
  type CredentialKey,
  type SecretStore,
} from '@main/secrets/secret-store';
import type { Clock } from '@shared/clock';
import type { AppSettings } from '@shared/types';
import { detectOllama, listOllamaModels } from '@main/categorization/ollama';
import { explainModelError } from '@main/categorization/errors';
import { createPlaidClient, type PlaidEnvironment } from '@main/plaid/client';
import { exchangePublicToken, pollForPublicToken, startHostedLink } from '@main/plaid/link';
import { fetchItemAccounts } from '@main/plaid/accounts';
import { isEverydayAccount } from '@main/accounts/everyday';
import { summarizeSync, type SyncOutcome } from '@main/sync/outcome';
import { resolveMerchantName } from '@shared/merchant-name';
import { humanizeCategoryIds } from '@shared/category-names';
import type { OverrideKind, OverrideRecord } from '@shared/types';
import type { ImportCommitInput, ImportPreviewInput } from '@shared/schemas';
import { commitImport } from '@main/import/commit';
import { selectPlaidInstitutions } from '@main/import/institutions';
import { previewImport } from '@main/import/preview';

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
const WHERE_IT_WENT_DAYS: Record<DashboardPeriod, number> = { week: 7, month: BURN_WINDOW_DAYS, year: 365 };
const UNCATEGORIZABLE = 'uncategorizable';
/** Stop a bulk recategorization rather than fire one doomed request per row. */
const MODEL_FAILURE_LIMIT = 5;
/** Real merchants with no history, so a working model answers with a real category. */
const MODEL_TEST_MERCHANTS = [
  { label: 'Whole Foods', descriptor: 'WHOLE FOODS MARKET', amountMinor: -8423 },
  { label: 'Shell', descriptor: 'SHELL OIL', amountMinor: -4210 },
  { label: 'Netflix', descriptor: 'NETFLIX.COM', amountMinor: -1549 },
] as const;

export interface ServiceDeps {
  readonly handle: DatabaseHandle;
  readonly userDataDir: string;
  readonly clock: Clock;
  readonly logger: DiagnosticLogger;
  readonly store: SecretStore;
  readonly pipeline: CategorizationPipeline;
  /**
   * Builds a categorizer from the CURRENT settings. Needed as a factory rather
   * than an instance: entering an API key in Settings must take effect without
   * a restart, and the instance above is the one captured at launch.
   */
  readonly buildPipeline: () => Promise<CategorizationPipeline>;
  readonly describeModel: () => Promise<ModelDescription>;
  readonly sync: () => Promise<SyncOutcome>;
  /** Push an event to the renderer. Progress on long jobs, nothing else. */
  readonly emit: (channel: string, payload: unknown) => void;
  /** Shown on the Health screen. */
  readonly appVersion?: string;
  /** Renders the window as a PDF. Supplied by the main process, which owns the window. */
  readonly printToPdf?: () => Promise<Buffer>;
}

type TransactionRow = typeof t.transactions.$inferSelect;

export class Services implements AppServices {
  private pendingLinkToken: string | null = null;
  /** Set by cancelRecategorize; read by the loop between transactions. */
  private recategorizeCancelled = false;
  private recategorizeRunning = false;

  readonly usage: UsageRecorder;

  constructor(private readonly deps: ServiceDeps) {
    this.usage = new UsageRecorder(deps.handle.db, deps.clock, deps.emit);
  }

  private get db(): DatabaseHandle['db'] {
    return this.deps.handle.db;
  }

  isOnline(): boolean {
    return true;
  }

  async completeness(): Promise<Completeness> {
    const rows = await selectPlaidInstitutions(this.db);
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
    const configured = new Set<CredentialKey>();
    for (const key of Object.keys(CREDENTIAL_ACCOUNTS) as CredentialKey[]) {
      if (await this.deps.store.get(CREDENTIAL_ACCOUNTS[key])) configured.add(key);
    }
    const has = (key: CredentialKey): boolean => configured.has(key);
    const accounts = await this.db.select().from(t.accounts);
    // Presence only — never the values (FR-047).
    return {
      plaidConfigured: has('plaidClientId') && has('plaidSecret'),
      plaidClientIdConfigured: has('plaidClientId'),
      plaidSecretConfigured: has('plaidSecret'),
      plaidEnv: (await this.readPlainSetting('plaidEnv')) === 'production' ? 'production' : 'sandbox',
      categorizationConfigured: has('anthropicApiKey'),
      accountCount: accounts.length,
      encryptionAvailable: true,
    };
  }

  /**
   * Replace or remove a credential after setup.
   *
   * Keys rotate, and the environment is the difference between a working sync
   * and a silent one — production credentials against sandbox fail every call.
   * Fields left out are untouched; an empty string removes that credential.
   */
  async updateCredentials(input: unknown): Promise<unknown> {
    const p = input as Record<string, string | undefined>;
    const changed: string[] = [];

    for (const key of Object.keys(CREDENTIAL_ACCOUNTS) as CredentialKey[]) {
      const value = p[key];
      if (value === undefined) continue;
      if (value.trim() === '') {
        await this.deps.store.delete(CREDENTIAL_ACCOUNTS[key]);
        changed.push(`${key} removed`);
        continue;
      }
      await this.deps.store.set(CREDENTIAL_ACCOUNTS[key], value.trim());
      changed.push(`${key} updated`);
    }

    if (p['plaidEnv']) {
      await this.upsertSetting('plaidEnv', p['plaidEnv'], false);
      changed.push(`environment set to ${p['plaidEnv']}`);
    }

    return {
      ok: true,
      changed,
      message: changed.length > 0 ? `Saved: ${changed.join(', ')}.` : 'Nothing to change.',
    };
  }

  async saveCredentials(input: unknown): Promise<unknown> {
    const p = input as Record<string, string | undefined>;
    for (const key of Object.keys(CREDENTIAL_ACCOUNTS) as CredentialKey[]) {
      const value = p[key];
      if (value) await this.deps.store.set(CREDENTIAL_ACCOUNTS[key], value);
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
    await this.deps.store.set(accessTokenAccount(institutionId), accessToken);
    await this.db.insert(t.institutions).values({
      id: institutionId,
      plaidItemId: itemId,
      accessTokenEncrypted: '',
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

  private readSecret(key: CredentialKey): Promise<string | null> {
    return this.deps.store.get(CREDENTIAL_ACCOUNTS[key]);
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
      source: r.source,
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
    const [institution] = await this.db.select().from(t.institutions).where(eq(t.institutions.id, id));
    // Deleting an imported institution deletes its accounts and their transactions.
    await this.db.delete(t.institutions).where(eq(t.institutions.id, id));
    if (institution?.source !== 'import') await this.deps.store.delete(accessTokenAccount(id));
    return { ok: true };
  }

  async reauthInstitution(): Promise<unknown> {
    return this.startLink();
  }

  // ---- Reading money -------------------------------------------------------

  async dashboard(range: unknown): Promise<unknown> {
    const { periodStart, periodEnd, period = 'month' } = range as {
      periodStart: string;
      periodEnd: string;
      period?: DashboardPeriod;
    };
    const [transactions, names, parents, completeness, accounts, uncounted] = await Promise.all([
      this.spendingIn(periodStart, periodEnd),
      this.categoryNames(),
      this.categoryParents(),
      this.completeness(),
      this.db.select().from(t.accounts),
      this.uncountedByCategory(periodStart, periodEnd),
    ]);

    const breakdown = breakdownByCategory(transactions);
    const incomeMinor = transactions
      .filter((x) => x.amountMinor > 0 && !x.isInternalTransfer)
      .reduce((a, x) => a + x.amountMinor, 0);
    const spendingMinor = spendingTotalMinor(transactions);
    const runway = await this.runway();

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
      categoryBreakdown: {
        ...this.namedRows(breakdown, names, parents, uncounted),
        ...completeness,
      },
      whatChanged: [],
      runway,
      ...(await this.dashboardExtras(runway, period)),
      ...completeness,
    };
  }

  /** Headline figures, the runway curve, upcoming charges and the last 30 days by group. */
  private async dashboardExtras(runway: Runway, period: DashboardPeriod): Promise<Record<string, unknown>> {
    const now = this.deps.clock.now();
    const span = periodSpan(now, period);
    const [dated, recent, sources, charges, names, parents, candidates] = await Promise.all([
      this.spendingIn(span.start, span.end),
      this.spendingIn(new Date(now.getTime() - WHERE_IT_WENT_DAYS[period] * 86_400_000).toISOString(), now.toISOString()),
      this.db.select().from(t.incomeSources),
      this.db.select().from(t.recurringCharges),
      this.merchantDisplayNames(),
      this.categoryParents(),
      this.recurringCandidates(),
    ]);
    const totals = periodTotals(dated, now, period);
    const active = charges.filter((c) => c.status === 'active');
    const nextSource = sources
      .filter((s) => s.isActive && new Date(s.nextExpectedDate) > now)
      .sort((a, b) => a.nextExpectedDate.localeCompare(b.nextExpectedDate))[0];
    return {
      kpis: {
        spent: { currentMinor: totals[totals.length - 1]?.spendingMinor ?? 0, seriesMinor: totals.map((m) => m.spendingMinor) },
        income: {
          currentMinor: totals[totals.length - 1]?.incomeMinor ?? 0,
          seriesMinor: totals.map((m) => m.incomeMinor),
          nextDeposit: nextSource
            ? {
                date: new Date(nextSource.nextExpectedDate).toISOString(),
                amountMinor: nextSource.expectedAmountMinor,
                merchantName: names.get(nextSource.merchantKey) ?? nextSource.merchantKey,
              }
            : null,
        },
        recurring: {
          monthlyMinor: active.reduce((a, c) => a + monthlyCostMinor(c.currentAmountMinor, c.cadence), 0),
          count: active.length,
          candidateCount: (candidates as unknown[]).length,
          seriesMinor: recurringSeries(
            charges.map((c) => ({
              monthlyMinor: monthlyCostMinor(c.currentAmountMinor, c.cadence),
              firstSeenDate: c.firstSeenDate,
              lastSeenDate: c.lastSeenDate,
              active: c.status === 'active',
            })),
            now,
          ),
        },
        safeToSpendPerDayMinor: safeToSpendPerDayMinor(runway, now),
      },
      upcomingRecurring: upcomingCharges(
        active.map((c) => ({
          merchantName: names.get(c.merchantKey) ?? c.merchantKey,
          date: nextExpectedDate(c.lastSeenDate, c.cadence),
          amountMinor: Math.abs(c.currentAmountMinor),
        })),
        now.toISOString().slice(0, 10),
      ),
      runwaySeries: runwaySeries(runway, now),
      whereItWent: spendByGroup(breakdownByCategory(recent).rows, await this.categoryNames(), parents),
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
    const [transactions, names, parents, completeness, uncounted] = await Promise.all([
      this.spendingIn(periodStart, periodEnd),
      this.categoryNames(),
      this.categoryParents(),
      this.completeness(),
      this.uncountedByCategory(periodStart, periodEnd),
    ]);
    return {
      ...this.namedRows(breakdownByCategory(transactions), names, parents, uncounted),
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
      accountIds?: string[];
      needsReviewOnly?: boolean;
      merchantKey?: string;
      direction?: 'all' | 'in' | 'out';
      minAmountMinor?: number;
      maxAmountMinor?: number;
      spendingOnly?: boolean;
      limit: number;
      offset: number;
    };
    const [rows, live, completeness, aliases, everydayIds, recurringKeys, parents, accountLabels] = await Promise.all([
      this.transactionsIn(q.periodStart, q.periodEnd),
      this.liveCategorizations(),
      this.completeness(),
      this.merchantAliases(),
      this.everydayAccountIds(),
      this.activeRecurringKeys(),
      this.categoryParents(),
      this.accountLabels(),
    ]);

    let filtered = rows;
    if (q.categoryIds?.length) {
      // A top-level category stands for its subcategories too.
      const wanted = new Set(q.categoryIds);
      const inWanted = (categoryId: string): boolean =>
        wanted.has(categoryId) || wanted.has(parents.get(categoryId) ?? '');
      filtered = filtered.filter((r) => inWanted(live.get(r.id)?.categoryId ?? ''));
    }
    if (q.accountIds?.length) {
      const accountIds = new Set(q.accountIds);
      filtered = filtered.filter((r) => accountIds.has(r.accountId));
    }
    if (q.needsReviewOnly) filtered = filtered.filter((r) => live.get(r.id)?.needsReview ?? true);
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

    // Applied last, over the same set the other filters produced, so the count
    // of what was left out belongs to this category rather than the whole
    // period. Drilling into a figure must show the transactions behind it, and
    // say plainly what it is not showing (Constitution II, IX).
    const countsTowardSpending = (r: TransactionRow): boolean =>
      everydayIds.has(r.accountId) && this.countsAsSpending(r);
    const excludedCount = q.spendingOnly
      ? filtered.filter((r) => !countsTowardSpending(r)).length
      : 0;
    if (q.spendingOnly) filtered = filtered.filter(countsTowardSpending);

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
          isRecurring: isRecurringRow(r, recurringKeys),
          description: r.description,
          postedDate: r.postedDate,
          categoryId: c?.categoryId ?? UNCATEGORIZABLE,
          confidence: c?.confidence ?? 0,
          categorySource: c?.source ?? null,
          needsReview: c?.needsReview ?? true,
          isInternalTransfer: r.isInternalTransfer,
          originalCurrency: r.originalCurrency,
          originalAmountMinor: r.originalAmountMinor,
          userMerchantName: r.userMerchantName,
          userNote: r.userNote,
          userExcluded: r.userExcluded,
          userRecurringOverride: r.userRecurringOverride,
          ...accountLabels.get(r.accountId),
        };
      }),
      totalCount: filtered.length,
      // Only meaningful alongside spendingOnly; zero otherwise.
      excludedCount,
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
    const [rows, names, accountLabels] = await Promise.all([
      this.db.select().from(t.incomeSources),
      this.merchantDisplayNames(),
      this.accountLabels(),
    ]);
    return rows.map((r) => ({
      ...accountLabels.get(r.accountId),
      id: r.id,
      merchantKey: r.merchantKey,
      merchantName: names.get(r.merchantKey) ?? r.merchantKey,
      expectedAmountMinor: r.expectedAmountMinor,
      cadence: r.cadence,
      nextExpectedDate: r.nextExpectedDate,
      daysUntilNext: daysUntil(new Date(r.nextExpectedDate), this.deps.clock.now()),
      detectionConfidence: r.detectionConfidence,
      isUserConfirmed: r.isUserConfirmed,
    }));
  }

  /** Income and spending for each of the last six months. Spending is positive. */
  async incomeHistory(): Promise<unknown> {
    const now = this.deps.clock.now();
    const rows = await this.spendingIn(monthRange(now, MONTHS_SHOWN - 1).start, monthRange(now).end);
    return monthlyTotals(rows, now);
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
    const [live, txs, aliases, categoryNames, recurringKeys, profiles, accountLabels] = await Promise.all([
      this.liveCategorizations(),
      this.db.select().from(t.transactions),
      this.merchantAliases(),
      this.categoryNames(),
      this.activeRecurringKeys(),
      this.db.select().from(t.merchantProfiles),
      this.accountLabels(),
    ]);
    const distributions = new Map(profiles.map((p) => [p.merchantKey, p.categoryDistribution]));
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
              isRecurring: isRecurringRow(tx, recurringKeys),
              description: tx.description,
              userMerchantName: tx.userMerchantName,
              userNote: tx.userNote,
              userExcluded: tx.userExcluded,
              userRecurringOverride: tx.userRecurringOverride,
              postedDate: tx.postedDate,
              categoryId: c.categoryId,
              confidence: c.confidence,
              categorySource: c.source,
              needsReview: true,
              isInternalTransfer: tx.isInternalTransfer,
              originalCurrency: tx.originalCurrency,
              originalAmountMinor: tx.originalAmountMinor,
              ...accountLabels.get(tx.accountId),
            },
            guessCategoryId: c.categoryId,
            // The name, because an identifier is not a name. The model quotes
            // taxonomy ids back in its reasoning, so that text is cleaned too.
            guessCategoryName: categoryNames.get(c.categoryId) ?? c.categoryId,
            suggestions: suggestCategoryIds(c.categoryId, distributions.get(tx.merchantKey ?? '')).map(
              (categoryId) => ({ categoryId, name: categoryNames.get(categoryId) ?? categoryId }),
            ),
            confidence: c.confidence,
            reasoning: c.reasoning ? humanizeCategoryIds(c.reasoning, categoryNames) : null,
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
    const { updated, skippedOneOffs } = await this.setCategoryRule(merchantKey, categoryId);
    return { updated, skippedUserConfirmed: skippedOneOffs, restatedPeriods: [] };
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
      scope?: 'transaction' | 'merchant';
      userNote?: string | null;
      userExcluded?: boolean;
      userRecurringOverride?: 'recurring' | 'not_recurring' | null;
    };
    const wholeMerchant = p.scope === 'merchant';
    const at = this.deps.clock.now().toISOString();

    const target = (
      await this.db.select().from(t.transactions).where(eq(t.transactions.id, p.transactionId))
    )[0];
    const merchantKey = wholeMerchant ? target?.merchantKey : null;

    const patch: Record<string, unknown> = {};
    // Names resolve one-off, then rule: only the single-charge scope writes the row.
    if (p.userMerchantName !== undefined && !wholeMerchant) {
      patch['userMerchantName'] = p.userMerchantName;
    }
    if (p.userMerchantName !== undefined && merchantKey) {
      await setMerchantName(this.db, merchantKey, p.userMerchantName, at);
    }
    if (p.userNote !== undefined) patch['userNote'] = p.userNote;
    if (p.userExcluded !== undefined) patch['userExcluded'] = p.userExcluded;
    if (p.userRecurringOverride !== undefined) {
      patch['userRecurringOverride'] = p.userRecurringOverride;
    }
    if (Object.keys(patch).length > 0) {
      await this.db.update(t.transactions).set(patch).where(eq(t.transactions.id, p.transactionId));
    }

    let outcome = { updated: 0, skippedOneOffs: 0 };
    if (p.categoryId && merchantKey) {
      // The edited charge joins the rule even if it was a one-off: the user chose All.
      await supersedeCategorization(
        this.db,
        { transactionId: p.transactionId, categoryId: p.categoryId, source: 'rule' },
        at,
      );
      const applied = await this.setCategoryRule(merchantKey, p.categoryId);
      outcome = { ...applied, updated: applied.updated + 1 };
    } else if (p.categoryId) {
      await supersedeCategorization(
        this.db,
        { transactionId: p.transactionId, categoryId: p.categoryId, source: 'user' },
        at,
      );
      outcome = { updated: 1, skippedOneOffs: 0 };
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
      retroactiveCandidateCount: 0,
      ...outcome,
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
    const month = monthRange(this.deps.clock.now());
    const [categories, categorizations, monthRows] = await Promise.all([
      this.db.select().from(t.categories),
      this.db.select().from(t.categorizations).where(isNull(t.categorizations.supersededBy)),
      this.spendingIn(month.start, month.end),
    ]);
    const spend = categorySpend(
      breakdownByCategory(monthRows).rows,
      new Map(categories.map((c) => [c.id, c.parentId])),
    );
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
      /** This month's spending in this category alone, positive. */
      spentMinor: spend.direct.get(c.id) ?? 0,
      /** This month's spending in this category and its subcategories, positive. */
      rolledUpSpentMinor: spend.rolledUp.get(c.id) ?? 0,
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
    await setMerchantName(this.db, p.merchantKey, p.displayName, this.deps.clock.now().toISOString());
    return { ok: true };
  }

  async listRules(): Promise<unknown> {
    return listRules(this.db);
  }

  async updateRule(input: unknown): Promise<unknown> {
    const p = input as { merchantKey: string; displayName?: string | null; categoryId?: string | null };
    const at = this.deps.clock.now().toISOString();
    if (p.displayName !== undefined) await setMerchantName(this.db, p.merchantKey, p.displayName, at);
    if (p.categoryId === undefined) return { updated: 0, skippedOneOffs: 0 };
    if (p.categoryId === null) {
      await setRuleCategory(this.db, p.merchantKey, null, at);
      return { updated: 0, skippedOneOffs: 0 };
    }
    return this.setCategoryRule(p.merchantKey, p.categoryId);
  }

  async deleteRule(input: unknown): Promise<unknown> {
    await deleteRule(this.db, (input as { merchantKey: string }).merchantKey);
    return { ok: true };
  }

  /** Make the category the merchant's rule and re-apply it to every charge that is not a one-off. */
  private async setCategoryRule(
    merchantKey: string,
    categoryId: string,
  ): Promise<{ updated: number; skippedOneOffs: number }> {
    const at = this.deps.clock.now().toISOString();
    this.deps.pipeline.confirmCategory(merchantKey, categoryId);
    await setRuleCategory(this.db, merchantKey, categoryId, at);
    return applyRuleCategory(this.db, merchantKey, categoryId, at);
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
      nextExpectedDate: nextExpectedDate(r.lastSeenDate, r.cadence),
      monthlyCostMinor: monthlyCostMinor(r.currentAmountMinor, r.cadence),
      yearlyCostMinor: yearlyCostMinor(r.currentAmountMinor, r.cadence),
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


  // ---- Finding recurring charges -------------------------------------------

  /**
   * Charges that look recurring but have not been decided on.
   *
   * Suggestions, not conclusions: anything the user has already answered — in
   * either direction — is gone from this list.
   */
  async recurringCandidates(): Promise<unknown> {
    const [rows, aliases, rules, everydayIds] = await Promise.all([
      this.db.select().from(t.transactions),
      this.merchantAliases(),
      this.db.select().from(t.recurringRules),
      this.everydayAccountIds(),
    ]);
    const decided = new Set(rules.map((r) => `${r.merchantKey}:${r.amountMinor}`));

    const candidates = findRecurringCandidates(
      this.everyday(rows, everydayIds)
        .filter((r) => !r.isInternalTransfer && !r.userExcluded && r.settlementState !== 'removed')
        .map((r) => ({
          transactionId: r.id,
          merchantKey: r.merchantKey ?? '',
          merchantName: resolveMerchantName(r, aliases),
          amountMinor: r.amountMinor,
          occurredAt: new Date(r.datetime ?? `${r.postedDate}T12:00:00Z`),
        })),
    );

    return candidates
      .filter((c) => !decided.has(`${c.merchantKey}:${c.amountMinor}`))
      .map((c) => ({
        key: c.key,
        merchantKey: c.merchantKey,
        merchantName: c.merchantName,
        amountMinor: c.amountMinor,
        cadence: c.cadence,
        occurrences: c.occurrences,
        firstSeen: c.firstSeen.toISOString(),
        lastSeen: c.lastSeen.toISOString(),
        nextExpected: c.nextExpected.toISOString(),
        confidence: c.confidence,
        totalPaidMinor: c.totalPaidMinor,
        transactionIds: c.transactionIds,
      }));
  }

  /**
   * Record the user's answer about a candidate and apply it everywhere.
   *
   * Every instance of the charge is marked, which is the whole point of being
   * asked once. The rule is stored too, so instances that arrive later follow
   * the same answer rather than reappearing as a fresh question.
   */
  async decideRecurring(input: unknown): Promise<unknown> {
    const p = input as {
      merchantKey: string;
      amountMinor: number;
      decision: 'recurring' | 'not_recurring';
      cadence?: string;
    };
    const at = this.deps.clock.now().toISOString();

    await this.db
      .insert(t.recurringRules)
      .values({
        id: `rrule_${randomUUID().slice(0, 8)}`,
        merchantKey: p.merchantKey,
        amountMinor: p.amountMinor,
        decision: p.decision,
        cadence: p.cadence ?? null,
        createdAt: at,
      })
      .onConflictDoUpdate({
        target: [t.recurringRules.merchantKey, t.recurringRules.amountMinor],
        set: { decision: p.decision, cadence: p.cadence ?? null, createdAt: at },
      });

    const marked = await this.applyRecurringRules();

    if (p.decision === 'recurring') {
      await this.db
        .insert(t.recurringCharges)
        .values({
          id: `rec_${randomUUID().slice(0, 8)}`,
          merchantKey: p.merchantKey,
          currentAmountMinor: p.amountMinor,
          cadence: normalizeLedgerCadence(p.cadence),
          firstSeenDate: at.slice(0, 10),
          lastSeenDate: at.slice(0, 10),
          cumulativePaidMinor: 0,
          detectedAt: at,
          status: 'active',
          userAcknowledged: true,
        })
        .onConflictDoNothing();
      // Rebuild so the ledger reflects the confirmation immediately.
      await this.refreshAnalysis();
    }

    return { ok: true, marked };
  }

  /**
   * Stamp every standing decision onto the transactions it covers.
   *
   * Run after a decision and on every analysis pass, so a charge that arrives
   * next month inherits the answer the user already gave.
   */
  private async applyRecurringRules(): Promise<number> {
    const rules = await this.db.select().from(t.recurringRules);
    let marked = 0;
    for (const rule of rules) {
      const result = await this.db
        .update(t.transactions)
        .set({ userRecurringOverride: rule.decision })
        .where(
          and(
            eq(t.transactions.merchantKey, rule.merchantKey),
            eq(t.transactions.amountMinor, rule.amountMinor),
          ),
        );
      marked += Number((result as { changes?: number }).changes ?? 0);
    }
    return marked;
  }

  // ---- Alerts and reports --------------------------------------------------

  async listAlerts(): Promise<unknown> {
    const [rows, rules, transactions, aliases] = await Promise.all([
      this.db.select().from(t.alerts).orderBy(desc(t.alerts.eventOccurredAt)),
      this.db.select().from(t.alertRules),
      this.db.select().from(t.transactions),
      this.merchantAliases(),
    ]);
    const byRule = new Map(rules.map((r) => [r.id, r.type]));
    const byId = new Map(transactions.map((x) => [x.id, x]));
    return rows.map((a) => {
      const tx = a.triggeredByTransactionId ? byId.get(a.triggeredByTransactionId) : undefined;
      return {
        id: a.id,
        // Falls back to the type captured at fire time, so an alert from a since
        // deleted rule still describes itself.
        type: (a.ruleId ? byRule.get(a.ruleId) : null) ?? a.ruleType,
        // Both surfaced, so a replayed alert is never mistaken for live (FR-057).
        eventOccurredAt: a.eventOccurredAt,
        detectedAt: a.detectedAt,
        dismissed: a.dismissedAsFalsePositive,
        transactionId: tx?.id ?? null,
        merchantName: tx ? resolveMerchantName(tx, aliases) : null,
        amountMinor: tx?.amountMinor ?? null,
      };
    });
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

  /** Every recurring-charge price change, with the merchant's display name. */
  private async priceChanges(): Promise<PriceChange[]> {
    const [changes, charges, names] = await Promise.all([
      this.db.select().from(t.recurringChargeAmountChanges),
      this.db.select().from(t.recurringCharges),
      this.merchantDisplayNames(),
    ]);
    const keyById = new Map(charges.map((c) => [c.id, c.merchantKey]));
    return changes.map((c) => {
      const key = keyById.get(c.recurringChargeId) ?? '';
      return { ...c, merchantName: names.get(key) ?? key };
    });
  }

  async listReports(): Promise<unknown> {
    const rows = await this.db
      .select()
      .from(t.periodReports)
      .orderBy(desc(t.periodReports.periodStart));
    const stored = rows.map((r) => JSON.parse(r.content) as Parameters<typeof presentReportContent>[0]);
    const [purchases, aliases, merchantNames, priceChanges] = await Promise.all([
      this.db
        .select()
        .from(t.transactions)
        .where(inArray(t.transactions.id, stored.flatMap((c) => c.largestPurchases?.map((p) => p.id) ?? []))),
      this.merchantAliases(),
      this.merchantDisplayNames(),
      this.priceChanges(),
    ]);
    const lookups = { transactions: new Map(purchases.map((tx) => [tx.id, tx])), aliases, merchantNames };
    const contents = stored.map((c) => presentReportContent(c, lookups) as unknown as StoredContent);
    const spent = contents.map((c) => reportSpentMinor(c));
    const dated = rows.length
      ? await this.spendingIn(
          rows.reduce((a, r) => (r.periodStart < a ? r.periodStart : a), rows[0]?.periodStart ?? ''),
          rows.reduce((a, r) => (r.periodEnd > a ? r.periodEnd : a), ''),
        )
      : [];
    return rows.map((r, index) => {
      const content = contents[index] ?? {};
      const others = rows.flatMap((o, i) => (i !== index && o.type === r.type ? [spent[i] ?? 0] : []));
      return {
        headline: reportHeadline(spent[index] ?? 0, others),
        summary: reportSummary(
          content,
          priceChanges.filter((c) => c.changedAt >= r.periodStart && c.changedAt < r.periodEnd),
        ),
        series: dailySpending(r.periodStart, r.periodEnd, dated),
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
    const content = JSON.parse(row.content) as Parameters<typeof presentReportContent>[0];
    const [transactions, aliases, merchantNames, sameType] = await Promise.all([
      this.db.select().from(t.transactions).where(inArray(t.transactions.id, content.largestPurchases?.map((p) => p.id) ?? [])),
      this.merchantAliases(),
      this.merchantDisplayNames(),
      this.db.select().from(t.periodReports).where(eq(t.periodReports.type, row.type)),
    ]);
    return {
      ...row,
      content: presentReportContent(content, {
        transactions: new Map(transactions.map((tx) => [tx.id, tx])),
        aliases,
        merchantNames,
      }),
      kpiSeries: kpiSeries(sameType, row),
    };
  }

  async exportReportPdf(input: unknown): Promise<unknown> {
    const { id } = input as { id: string };
    const row = (await this.db.select().from(t.periodReports).where(eq(t.periodReports.id, id)))[0];
    if (!row) throw new IpcFailure('INTERNAL', 'Report not found', false);
    if (!this.deps.printToPdf) throw new IpcFailure('INTERNAL', 'Printing is not available', false);
    const target = await this.chooseSavePath(reportPdfName(row));
    if (!target) return { ok: false };
    writeFileSync(target, await this.deps.printToPdf());
    return { ok: true, path: target };
  }

  // ---- Diagnostics, settings, data -----------------------------------------

  async health(): Promise<unknown> {
    const [events, institutions, transactions] = await Promise.all([
      this.db.select().from(t.diagnosticEvents).orderBy(desc(t.diagnosticEvents.occurredAt)).limit(1000),
      selectPlaidInstitutions(this.db),
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
      categorization: await this.deps.describeModel(),
      encryption: {
        databaseEncrypted: true,
        keysInKeychain: (await this.deps.store.get(DATABASE_KEY_ACCOUNT)) !== null,
      },
      updates: { version: this.deps.appVersion ?? 'unknown' },
      syncHistory: syncHistory(events),
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
      ...(map.has('usageRetention')
        ? { usageRetention: map.get('usageRetention') as AppSettings['usageRetention'] }
        : {}),
      ...(map.has('lastBackupAt') ? { lastBackupAt: map.get('lastBackupAt') as string } : {}),
    });
  }

  async updateSettings(input: unknown): Promise<unknown> {
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (value !== undefined) await this.upsertSetting(key, String(value), false);
    }
    return { ok: true };
  }

  async usageSummary(days: 7 | 30 | null): Promise<unknown> {
    return usageSummary(this.db, days, this.deps.clock.now());
  }

  async recentUsage(limit: number): Promise<unknown> {
    return recentUsage(this.db, limit);
  }

  async exportUsage(): Promise<unknown> {
    const target = await this.chooseSavePath('money-usage.csv');
    if (!target) return { ok: false };
    writeFileSync(target, await usageCsv(this.db), 'utf8');
    return { ok: true, path: target };
  }

  async recordView(route: string): Promise<unknown> {
    await this.usage.record({ feature: `view:${route}`, kind: 'view', outcome: 'success' });
    return { ok: true };
  }

  async recordAction(feature: string): Promise<unknown> {
    await this.usage.record({ feature, kind: 'action', outcome: 'success' });
    return { ok: true };
  }

  async exportData(destPath: string, passphrase: string): Promise<unknown> {
    const target = destPath || (await this.chooseDirectory());
    if (!target) return { ok: false };
    const result = await exportBackup({
      handle: this.deps.handle,
      store: this.deps.store,
      userDataDir: this.deps.userDataDir,
      destDir: target,
      passphrase,
    });
    await this.upsertSetting('lastBackupAt', this.deps.clock.now().toISOString(), false);
    return { ok: true, path: result.databasePath };
  }

  async importData(srcPath: string, passphrase: string): Promise<unknown> {
    const source = srcPath || (await this.chooseDirectory());
    if (!source) return { ok: false };
    await restoreBackup({
      srcDir: source,
      userDataDir: this.deps.userDataDir,
      store: this.deps.store,
      passphrase,
      handle: this.deps.handle,
    });
    // The database handle is closed; the app relaunches to open the restored file.
    return { ok: true, restored: true, requiresRestart: true };
  }

  async deleteAllData(): Promise<unknown> {
    const institutions = await this.db.select({ id: t.institutions.id }).from(t.institutions);
    this.deps.handle.close();
    await deleteAllData({
      userDataDir: this.deps.userDataDir,
      store: this.deps.store,
      institutionIds: institutions.map((row) => row.id),
    });
    return { ok: true, requiresRestart: true };
  }

  async previewImport(input: unknown): Promise<unknown> {
    return previewImport(this.db, input as ImportPreviewInput);
  }

  async commitImport(input: unknown): Promise<unknown> {
    const result = await commitImport(
      { handle: this.deps.handle, clock: this.deps.clock, buildPipeline: this.deps.buildPipeline },
      input as ImportCommitInput,
    );
    // Recurring and income detection need the imported history.
    if (result.imported > 0) await this.refreshAnalysis();
    return result;
  }

  /** Whether Ollama answers at the saved address, within two seconds. */
  async detectOllama(): Promise<unknown> {
    return detectOllama((await this.readPlainSetting('ollamaBaseUrl')) ?? undefined);
  }

  /** Installed Ollama chat models, for the settings picker. Throws the explained reason on failure. */
  async listOllamaModels(): Promise<unknown> {
    const baseUrl = (await this.readPlainSetting('ollamaBaseUrl')) ?? undefined;
    try {
      return await listOllamaModels(baseUrl);
    } catch (error) {
      const reason = explainModelError(error instanceof Error ? error.message : String(error));
      throw new IpcFailure('CATEGORIZATION_UNAVAILABLE', reason, true);
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
    // Standing decisions first: a charge that arrived since the last pass must
    // inherit the answer the user already gave for it.
    await this.applyRecurringRules();

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
    const names = new Map(
      (await this.db.select().from(t.categories)).map((c) => [c.id, c.name]),
    );
    const answers: string[] = [];
    const startedAt = performance.now();
    for (const probe of MODEL_TEST_MERCHANTS) {
      const result = await pipeline.categorize({
        transactionId: `model-test-${probe.label}`,
        descriptor: probe.descriptor,
        amountMinor: probe.amountMinor,
        occurredAt: this.deps.clock.now(),
      });
      answers.push(`${probe.label} → ${names.get(result.categoryId) ?? result.categoryId}`);
    }
    const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);

    if (pipeline.lastModelError) {
      return { ok: false, ...description, message: explainModelError(pipeline.lastModelError) };
    }
    return {
      ok: true,
      ...description,
      message: `${description.model ?? description.provider} answered in ${seconds} s: ${answers.join(', ')}`,
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
    if (this.recategorizeRunning) {
      throw new IpcFailure(
        'VALIDATION_FAILED',
        'A recategorization is already running.',
        true,
        'Wait for it to finish',
      );
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
    let processed = 0;
    let stoppedEarly = false;

    this.recategorizeRunning = true;
    this.recategorizeCancelled = false;
    this.deps.emit('categorization:progress', {
      processed: 0,
      total: targets.length,
      changed: 0,
      done: false,
    });

    try {
      for (const row of targets) {
        if (this.recategorizeCancelled) break;

        const result = await pipeline.categorize({
          transactionId: row.id,
          descriptor: row.merchantName ?? row.description,
          amountMinor: row.amountMinor,
          occurredAt: new Date(row.datetime ?? `${row.postedDate}T12:00:00Z`),
        });

        // Accept a learned answer too, not only a fresh model call: once this
        // run has seen a merchant enough times the pipeline resolves it from
        // that history, and skipping those would leave repeat merchants alone.
        if (result.categoryId !== UNCATEGORIZABLE) {
          await this.replaceCategorization(row.id, result, at);
          changed += 1;
        }
        processed += 1;
        this.deps.emit('categorization:progress', {
          processed,
          total: targets.length,
          changed,
          done: false,
        });

        // A bad key or a down endpoint should not mean one failed request per
        // transaction. Stop and say so.
        if (pipeline.modelFailures >= MODEL_FAILURE_LIMIT) {
          stoppedEarly = true;
          break;
        }
      }
    } finally {
      this.recategorizeRunning = false;
    }

    const cancelled = this.recategorizeCancelled;
    this.recategorizeCancelled = false;

    const scopeLabel = scope === 'all' ? 'transactions' : 'unresolved transactions';
    const message = cancelled
      ? `Stopped. Recategorized ${changed} of ${targets.length} ${scopeLabel}; what was done is kept.`
      : stoppedEarly
        ? `Stopped after ${pipeline.modelFailures} model failures. Recategorized ${changed} of ${targets.length} ${scopeLabel}. Last error: ${explainModelError(pipeline.lastModelError)}`
        : pipeline.lastModelError
          ? `Recategorized ${changed} of ${targets.length} ${scopeLabel}. The model failed on ${pipeline.modelFailures}: ${explainModelError(pipeline.lastModelError)}`
          : `Recategorized ${changed} of ${targets.length} ${scopeLabel}.`;

    this.deps.emit('categorization:progress', {
      processed,
      total: targets.length,
      changed,
      done: true,
      cancelled,
      message,
    });

    return {
      ok: !cancelled && pipeline.lastModelError === null,
      examined: targets.length,
      processed,
      changed,
      cancelled,
      modelFailures: pipeline.modelFailures,
      stoppedEarly,
      message,
    };
  }

  /**
   * Ask the running recategorization to stop.
   *
   * Checked between transactions, so it stops after the one in flight rather
   * than abandoning a request mid-write. Everything already done is kept.
   */
  async cancelRecategorize(): Promise<unknown> {
    if (!this.recategorizeRunning) return { ok: true, running: false };
    this.recategorizeCancelled = true;
    return { ok: true, running: true };
  }

  /**
   * Every override the user has made, in one list.
   *
   * A rename or an exclusion set months ago is otherwise invisible until it
   * turns up wrong in a report, with no way to find what caused it.
   */
  async listOverrides(): Promise<unknown> {
    const [aliases, transactions, categorizations, categoryNames, recurringRules] =
      await Promise.all([
        this.db.select().from(t.merchantAliases),
        this.db.select().from(t.transactions),
        this.liveCategorizations(),
        this.categoryNames(),
        this.db.select().from(t.recurringRules),
      ]);

    const out: OverrideRecord[] = [];
    const aliasMap = new Map(aliases.map((a) => [a.merchantKey, a.displayName]));
    const ruledMerchants = new Set(recurringRules.map((r) => `${r.merchantKey}:${r.amountMinor}`));

    for (const rule of recurringRules) {
      const covered = transactions.filter(
        (r) => r.merchantKey === rule.merchantKey && r.amountMinor === rule.amountMinor,
      );
      out.push({
        id: `recurring_rule:${rule.merchantKey}:${rule.amountMinor}`,
        kind: 'recurring_rule',
        target: `${rule.merchantKey}:${rule.amountMinor}`,
        label: covered[0] ? resolveMerchantName(covered[0], aliasMap) : rule.merchantKey,
        original: 'Detected automatically',
        current: rule.decision === 'recurring' ? 'Recurring' : 'Not recurring',
        affectedCount: covered.length,
        occurredAt: rule.createdAt,
      });
    }
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
      // A per-transaction flag explained by a standing rule is listed once as
      // that rule, not once per transaction it touched.
      if (row.userRecurringOverride && !ruledMerchants.has(`${row.merchantKey}:${row.amountMinor}`)) {
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
      case 'recurring_rule': {
        // The rule and the flags it stamped go together: leaving the flags
        // behind would keep enforcing a decision the user just withdrew.
        const [merchantKey, amount] = splitRuleTarget(p.target);
        await this.db
          .delete(t.recurringRules)
          .where(
            and(
              eq(t.recurringRules.merchantKey, merchantKey),
              eq(t.recurringRules.amountMinor, amount),
            ),
          );
        await this.db
          .update(t.transactions)
          .set({ userRecurringOverride: null })
          .where(
            and(
              eq(t.transactions.merchantKey, merchantKey),
              eq(t.transactions.amountMinor, amount),
            ),
          );
        break;
      }
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
    /** categoryId -> transactions in it that did not count toward spending. */
    uncounted: ReadonlyMap<string, number> = new Map(),
  ): { rows: unknown[]; totalMinor: number } {
    const describe = (
      categoryId: string,
      totalMinor: number,
      countedCount: number,
    ): Record<string, unknown> => {
      const parentId = parents.get(categoryId) ?? null;
      const uncountedCount = uncounted.get(categoryId) ?? 0;
      return {
        categoryId,
        name: names.get(categoryId) ?? categoryId,
        // Supplied so the dashboard can roll spending up to the parent.
        parentId,
        parentName: parentId ? (names.get(parentId) ?? parentId) : null,
        totalMinor,
        // Every transaction in the category, which is what "how many are in
        // here" means to a reader. The subset the amount was built from is
        // reported separately rather than standing in for the whole.
        txCount: countedCount + uncountedCount,
        countedCount,
        uncountedCount,
      };
    };

    const rows = breakdown.rows.map((r) =>
      describe(r.categoryId, r.totalMinor, r.transactionCount),
    );

    // A category holding only transactions that do not count as spending — a
    // credit-card payment category, say — would otherwise not appear at all,
    // leaving no way to reach those transactions. It is listed at zero, which
    // keeps the rows summing to the total.
    const present = new Set(breakdown.rows.map((r) => r.categoryId));
    for (const [categoryId, count] of uncounted) {
      if (count > 0 && !present.has(categoryId)) rows.push(describe(categoryId, 0, 0));
    }

    return { rows, totalMinor: breakdown.totalMinor };
  }

  /**
   * Transactions per category that a spending figure leaves out.
   *
   * Money in, internal transfers, user exclusions, removed rows, and accounts
   * not marked day-to-day. Reported so the UI can offer them rather than
   * pretending they do not exist (Constitution IX).
   */
  private async uncountedByCategory(
    periodStart?: string,
    periodEnd?: string,
  ): Promise<Map<string, number>> {
    const [rows, live, everydayIds] = await Promise.all([
      this.transactionsIn(periodStart, periodEnd),
      this.liveCategorizations(),
      this.everydayAccountIds(),
    ]);
    const out = new Map<string, number>();
    for (const row of rows) {
      if (everydayIds.has(row.accountId) && this.countsAsSpending(row)) continue;
      const categoryId = live.get(row.id)?.categoryId ?? UNCATEGORIZABLE;
      out.set(categoryId, (out.get(categoryId) ?? 0) + 1);
    }
    return out;
  }

  /** Merchants with a live recurring charge, for flagging their transactions. */
  private async activeRecurringKeys(): Promise<Set<string>> {
    const rows = await this.db.select().from(t.recurringCharges);
    return new Set(rows.filter((r) => r.status === 'active').map((r) => r.merchantKey));
  }

  /** categoryId -> parentId, for rolling a breakdown up one level. */
  private async categoryParents(): Promise<Map<string, string | null>> {
    const rows = await this.db.select().from(t.categories);
    return new Map(rows.map((r) => [r.id, r.parentId]));
  }

  private async runway(): Promise<Runway> {
    const [sources, accounts] = await Promise.all([
      this.db.select().from(t.incomeSources),
      this.db.select().from(t.accounts),
    ]);
    const currentBalanceMinor = accounts
      .filter((a) => a.isEveryday)
      .reduce((a, x) => a + (x.currentBalanceMinor ?? 0), 0);

    const dailyBurnMinor = await this.dailyBurn();
    const projection = projectBalance({
      currentBalanceMinor,
      dailyBurnMinor,
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
      dailyBurnMinor,
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

  private async spendingIn(start: string, end: string): Promise<DatedTransaction[]> {
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
      postedDate: r.postedDate,
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

  /** Name and last digits of every account, by id, for rows that say where money moved. */
  private async accountLabels(): Promise<Map<string, { accountName: string; accountMask: string | null }>> {
    const rows = await this.db.select().from(t.accounts);
    return new Map(rows.map((a) => [a.id, { accountName: a.name, accountMask: a.mask }]));
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
    await supersedeCategorization(this.db, { transactionId, categoryId, source: 'user' }, at);
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
    // A merchant rule is resolved locally too; classifyLocally labels it 'rule'.
    return rows.filter((r) => r.source === 'local_history' || r.source === 'rule').length / rows.length;
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

/** The ledger stores a coarser cadence set than the candidate detector reports. */
function normalizeLedgerCadence(
  cadence: string | undefined,
): 'weekly' | 'monthly' | 'quarterly' | 'annual' {
  if (cadence === 'weekly' || cadence === 'biweekly') return 'weekly';
  if (cadence === 'quarterly') return 'quarterly';
  if (cadence === 'annual') return 'annual';
  return 'monthly';
}

/** A recurring-rule override target is "merchantKey:amountMinor". */
function splitRuleTarget(target: string): [string, number] {
  const at = target.lastIndexOf(':');
  return [target.slice(0, at), Number(target.slice(at + 1))];
}

/**
 * Whether a transaction is part of a recurring charge.
 *
 * The user's own answer wins in both directions; otherwise it follows the
 * ledger, so a subscription is marked without having to be confirmed one
 * transaction at a time.
 */
function isRecurringRow(row: TransactionRow, activeKeys: ReadonlySet<string>): boolean {
  if (row.userRecurringOverride === 'recurring') return true;
  if (row.userRecurringOverride === 'not_recurring') return false;
  return row.merchantKey !== null && activeKeys.has(row.merchantKey);
}
