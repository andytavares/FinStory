import { applySyncPage, detectInternalTransfers, mapPlaidTransaction } from '@main/ingestion/apply';
import type { PlaidTransactionLike, StoredTransaction } from '@main/ingestion/apply';
import { evaluateAlerts } from '@main/analysis/alerts';
import type { AlertRule, FiredAlert } from '@main/analysis/alerts';
import type { CategorizationPipeline } from '@main/categorization/pipeline';
import type { Clock } from '@shared/clock';

/**
 * The sync engine.
 *
 * Drives the whole ingestion pipeline: fetch a page, apply it, detect
 * transfers, categorize, evaluate alerts, persist. Every module it uses is
 * independently tested; this is what puts them in sequence.
 *
 * Takes a store and a source rather than a database and a Plaid client, so the
 * ordering and failure behaviour are testable without either.
 */

export interface SyncPage {
  readonly added: PlaidTransactionLike[];
  readonly modified: PlaidTransactionLike[];
  readonly removed: Array<{ transaction_id: string }>;
  readonly next_cursor: string;
  readonly has_more: boolean;
}

export interface SyncSource {
  readonly institutionId: string;
  readonly cursor: string | null;
  fetch(cursor: string | null): Promise<SyncPage>;
}

export interface SyncStore {
  loadTransactions(): Promise<StoredTransaction[]>;
  saveTransactions(next: StoredTransaction[]): Promise<void>;
  saveCursor(institutionId: string, cursor: string): Promise<void>;
  loadAlertRules(): Promise<AlertRule[]>;
  loadEmittedAlertKeys(): Promise<string[]>;
  saveAlerts(fired: FiredAlert[]): Promise<void>;
  saveCategorization(result: {
    transactionId: string;
    categoryId: string;
    confidence: number;
    source: string;
    needsReview: boolean;
    reasoning: string;
  }): Promise<void>;
  loadOwnAccountIds(): Promise<Set<string>>;
  markSynced(institutionId: string, at: string): Promise<void>;
  localAccountIdFor(plaidAccountId: string): Promise<string | null>;
}

export interface SyncEngineDeps {
  readonly store: SyncStore;
  readonly clock: Clock;
  readonly pipeline: CategorizationPipeline;
  readonly maxPages?: number;
}

export interface SyncFailure {
  readonly institutionId: string;
  readonly message: string;
}

export interface SyncResult {
  readonly added: number;
  readonly updated: number;
  readonly removed: number;
  readonly skipped: number;
  readonly alertsFired: number;
  readonly failures: SyncFailure[];
}

const DEFAULT_MAX_PAGES = 200;

export class SyncEngine {
  constructor(private readonly deps: SyncEngineDeps) {}

  async run(sources: readonly SyncSource[]): Promise<SyncResult> {
    let added = 0;
    let updated = 0;
    let removed = 0;
    let skipped = 0;
    let alertsFired = 0;
    const failures: SyncFailure[] = [];
    const newlyIngested: StoredTransaction[] = [];

    for (const source of sources) {
      try {
        const outcome = await this.syncOne(source);
        added += outcome.added;
        updated += outcome.updated;
        removed += outcome.removed;
        skipped += outcome.skipped;
        newlyIngested.push(...outcome.newlyIngested);
      } catch (error) {
        // One institution failing must not stop the others; its cursor is
        // deliberately left where it was so the next run re-fetches.
        failures.push({
          institutionId: source.institutionId,
          message: error instanceof Error ? error.message : 'Sync failed',
        });
      }
    }

    if (newlyIngested.length > 0) {
      alertsFired = await this.evaluateAlertsFor(newlyIngested);
    }

    return { added, updated, removed, skipped, alertsFired, failures };
  }

  private async syncOne(source: SyncSource): Promise<{
    added: number;
    updated: number;
    removed: number;
    skipped: number;
    newlyIngested: StoredTransaction[];
  }> {
    const maxPages = this.deps.maxPages ?? DEFAULT_MAX_PAGES;
    let cursor = source.cursor;
    let hasMore = true;
    let pages = 0;

    let added = 0;
    let updated = 0;
    let removed = 0;
    let skipped = 0;
    const newlyIngested: StoredTransaction[] = [];

    while (hasMore && pages < maxPages) {
      const page = await source.fetch(cursor);
      const existing = await this.deps.store.loadTransactions();

      const mapped = await this.mapAll(page.added);
      const mappedModified = await this.mapAll(page.modified);
      skipped += mapped.skipped + mappedModified.skipped;

      const applied = applySyncPage(existing, {
        added: mapped.transactions,
        modified: mappedModified.transactions,
        removed: page.removed.map((r) => r.transaction_id),
      });

      const ownAccountIds = await this.deps.store.loadOwnAccountIds();
      const withTransfers = detectInternalTransfers(applied.transactions, ownAccountIds);

      // Cursor is saved with the data it describes: a crash re-fetches rather
      // than skipping, and the unique index makes the retry free of duplicates.
      await this.deps.store.saveTransactions(withTransfers);
      await this.deps.store.saveCursor(source.institutionId, page.next_cursor);

      added += applied.inserted.length;
      updated += applied.updated.length;
      removed += applied.removed.length;
      newlyIngested.push(...applied.inserted);

      cursor = page.next_cursor;
      hasMore = page.has_more;
      pages += 1;
    }

    await this.categorize(newlyIngested);
    await this.deps.store.markSynced(source.institutionId, this.deps.clock.now().toISOString());

    return { added, updated, removed, skipped, newlyIngested };
  }

  /** Drop transactions whose account is not known locally rather than orphaning them. */
  private async mapAll(
    raw: readonly PlaidTransactionLike[],
  ): Promise<{ transactions: StoredTransaction[]; skipped: number }> {
    const transactions: StoredTransaction[] = [];
    let skipped = 0;
    for (const t of raw) {
      const accountId = await this.deps.store.localAccountIdFor(t.account_id);
      if (!accountId) {
        skipped += 1;
        continue;
      }
      transactions.push(mapPlaidTransaction(t, accountId));
    }
    return { transactions, skipped };
  }

  private async categorize(transactions: readonly StoredTransaction[]): Promise<void> {
    for (const t of transactions) {
      // Categorization never blocks ingestion: the pipeline already degrades to
      // a review-queue item on failure, so a throw here would be a defect.
      const result = await this.deps.pipeline.categorize({
        transactionId: t.id,
        descriptor: t.merchantName ?? t.description,
        amountMinor: t.amountMinor,
        occurredAt: new Date(t.datetime ?? `${t.postedDate}T12:00:00Z`),
      });
      await this.deps.store.saveCategorization({
        transactionId: result.transactionId,
        categoryId: result.categoryId,
        confidence: result.confidence,
        source: result.source,
        needsReview: result.needsReview,
        reasoning: result.reasoning,
      });
    }
  }

  private async evaluateAlertsFor(transactions: readonly StoredTransaction[]): Promise<number> {
    const [rules, emitted] = await Promise.all([
      this.deps.store.loadAlertRules(),
      this.deps.store.loadEmittedAlertKeys(),
    ]);

    const fired = evaluateAlerts(
      transactions.map((t) => ({
        transactionId: t.id,
        amountMinor: t.amountMinor,
        merchantKey: t.merchantKey,
        occurredAt: new Date(t.datetime ?? `${t.postedDate}T12:00:00Z`),
        isInternalTransfer: t.isInternalTransfer,
      })),
      rules,
      emitted,
    );

    if (fired.length > 0) await this.deps.store.saveAlerts(fired);
    return fired.length;
  }
}
