import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as t from '@main/db/schema';
import type { DatabaseHandle } from '@main/db/client';
import type { SyncStore } from './engine';
import type { StoredTransaction } from '@main/ingestion/apply';
import type { AlertRule, FiredAlert } from '@main/analysis/alerts';
import { AlertType } from '@main/analysis/alerts';
import type { Clock } from '@shared/clock';

/** Database-backed store for the sync engine. */
export class DrizzleSyncStore implements SyncStore {
  constructor(
    private readonly handle: DatabaseHandle,
    private readonly clock: Clock,
  ) {}

  private get db(): DatabaseHandle['db'] {
    return this.handle.db;
  }

  async loadTransactions(): Promise<StoredTransaction[]> {
    const rows = await this.db.select().from(t.transactions);
    // merchantKey is nullable in the schema (an unreadable descriptor yields an
    // empty key) but the ingestion type treats it as a string.
    return rows.map((r) => ({ ...r, merchantKey: r.merchantKey ?? '' }));
  }

  async saveTransactions(next: readonly StoredTransaction[]): Promise<void> {
    for (const tx of next) {
      await this.db
        .insert(t.transactions)
        .values({
          ...tx,
          firstSeenAt: this.clock.now().toISOString(),
          updatedAt: this.clock.now().toISOString(),
        })
        .onConflictDoUpdate({
          target: t.transactions.plaidTransactionId,
          // Update in place; never insert a second row (FR-005, FR-006).
          set: {
            amountMinor: tx.amountMinor,
            merchantName: tx.merchantName,
            merchantKey: tx.merchantKey,
            description: tx.description,
            postedDate: tx.postedDate,
            datetime: tx.datetime,
            pending: tx.pending,
            settlementState: tx.settlementState,
            isInternalTransfer: tx.isInternalTransfer,
            originalCurrency: tx.originalCurrency,
            originalAmountMinor: tx.originalAmountMinor,
            updatedAt: this.clock.now().toISOString(),
          },
        });
    }
  }

  async saveCursor(institutionId: string, cursor: string): Promise<void> {
    await this.db
      .update(t.institutions)
      .set({ syncCursor: cursor })
      .where(eq(t.institutions.id, institutionId));
  }

  async loadAlertRules(): Promise<AlertRule[]> {
    const rows = await this.db.select().from(t.alertRules);
    if (rows.length === 0) return seedRules(this.db);
    return rows.map((r) => ({
      id: r.id,
      type: r.type as AlertType,
      thresholdMinor: r.thresholdMinor,
      windowMinutes: r.windowMinutes,
      enabled: r.enabled,
    }));
  }

  async loadEmittedAlertKeys(): Promise<string[]> {
    const rows = await this.db.select().from(t.alerts);
    return rows.map((r) => r.dedupeKey);
  }

  async saveAlerts(fired: readonly FiredAlert[]): Promise<void> {
    for (const a of fired) {
      await this.db
        .insert(t.alerts)
        .values({
          id: `alert_${randomUUID().slice(0, 8)}`,
          ruleId: a.ruleId,
          ruleType: a.type,
          triggeredByTransactionId: a.triggeredByTransactionId,
          eventOccurredAt: a.eventOccurredAt.toISOString(),
          detectedAt: this.clock.now().toISOString(),
          deliveredAt: null,
          dismissedAsFalsePositive: false,
          dedupeKey: a.dedupeKey,
        })
        // The unique index is the real guarantee; this keeps a replay quiet.
        .onConflictDoNothing();
    }
  }

  async saveCategorization(result: {
    transactionId: string;
    categoryId: string;
    confidence: number;
    source: string;
    needsReview: boolean;
    reasoning: string;
  }): Promise<void> {
    const existing = await this.db
      .select()
      .from(t.categorizations)
      .where(
        and(
          eq(t.categorizations.transactionId, result.transactionId),
          isNull(t.categorizations.supersededBy),
        ),
      );
    // A user correction outranks anything the pipeline produces later.
    if (existing[0]?.isConfirmed) return;

    // Last line of defence. The pipeline is told the live taxonomy, but a
    // categorization referencing a category the user has deleted is a foreign
    // key violation that aborts the entire sync — losing transactions over a
    // labelling problem. Uncategorizable is always present and always honest.
    const categoryId = (await this.categoryExists(result.categoryId))
      ? result.categoryId
      : 'uncategorizable';

    const id = `cat_${randomUUID().slice(0, 12)}`;
    await this.db.insert(t.categorizations).values({
      id,
      transactionId: result.transactionId,
      categoryId,
      confidence: result.confidence,
      source: result.source as 'local_history' | 'model' | 'user',
      isConfirmed: false,
      needsReview: categoryId === result.categoryId ? result.needsReview : true,
      reasoning:
        categoryId === result.categoryId
          ? result.reasoning
          : `Suggested "${result.categoryId}", which is no longer one of your categories`,
      supersededBy: null,
      createdAt: this.clock.now().toISOString(),
    });
    if (existing[0]) {
      await this.db
        .update(t.categorizations)
        .set({ supersededBy: id })
        .where(eq(t.categorizations.id, existing[0].id));
    }
  }

  private async categoryExists(categoryId: string): Promise<boolean> {
    const rows = await this.db.select().from(t.categories).where(eq(t.categories.id, categoryId));
    return rows.length > 0;
  }

  async loadOwnAccountIds(): Promise<Set<string>> {
    const rows = await this.db.select().from(t.accounts);
    return new Set(rows.map((r) => r.id));
  }

  async markSynced(institutionId: string, at: string): Promise<void> {
    await this.db
      .update(t.institutions)
      .set({ lastSyncedAt: at, lastAttemptedSyncAt: at, status: 'healthy' })
      .where(eq(t.institutions.id, institutionId));
  }

  async markAttempted(institutionId: string, at: string, failed: boolean): Promise<void> {
    await this.db
      .update(t.institutions)
      .set({ lastAttemptedSyncAt: at, ...(failed ? { status: 'error' as const } : {}) })
      .where(eq(t.institutions.id, institutionId));
  }

  async localAccountIdFor(plaidAccountId: string): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(t.accounts)
      .where(eq(t.accounts.plaidAccountId, plaidAccountId));
    return rows[0]?.id ?? null;
  }
}

/** Sensible starting thresholds; all user-adjustable (FR-033). */
async function seedRules(db: DatabaseHandle['db']): Promise<AlertRule[]> {
  const rules: AlertRule[] = [
    { id: 'rule_large', type: AlertType.LargePurchase, thresholdMinor: 20_000, windowMinutes: null, enabled: true },
    { id: 'rule_daily', type: AlertType.DailyTotal, thresholdMinor: 15_000, windowMinutes: null, enabled: true },
    { id: 'rule_dupe', type: AlertType.DuplicateCharge, thresholdMinor: null, windowMinutes: 1440, enabled: true },
    { id: 'rule_floor', type: AlertType.BalanceFloor, thresholdMinor: 100_000, windowMinutes: null, enabled: true },
  ];
  for (const r of rules) {
    await db.insert(t.alertRules).values({ ...r, isSystem: true }).onConflictDoNothing();
  }
  return rules;
}
