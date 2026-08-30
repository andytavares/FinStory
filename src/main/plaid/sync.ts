import type { Transaction, RemovedTransaction } from 'plaid';

/**
 * The /transactions/sync cursor loop.
 *
 * The cursor is simultaneously the deduplication mechanism, the resumption
 * point, and the catch-up mechanism (research.md R2). A gap of five minutes and
 * a gap of three weeks are the same call.
 */

export interface SyncPageResponse {
  readonly added: Transaction[];
  readonly modified: Transaction[];
  readonly removed: RemovedTransaction[];
  readonly next_cursor: string;
  readonly has_more: boolean;
}

export interface SyncClient {
  sync(cursor: string | null): Promise<SyncPageResponse>;
}

/**
 * Commit a page and its cursor together.
 *
 * MUST be atomic with respect to the data: the cursor may only advance once the
 * page it describes is durably stored. Advancing first would skip transactions
 * on a crash, which is a silent correctness failure.
 */
export type CommitPage = (page: SyncPageResponse, cursor: string) => Promise<void>;

export interface SyncLoopResult {
  readonly finalCursor: string | null;
  readonly pagesProcessed: number;
  readonly stoppedAtCap: boolean;
}

export interface SyncLoopOptions {
  /** Backstop against a server that never clears has_more. */
  readonly maxPages?: number;
}

const DEFAULT_MAX_PAGES = 200;

export async function runSyncLoop(
  client: SyncClient,
  startCursor: string | null,
  commit: CommitPage,
  options: SyncLoopOptions = {},
): Promise<SyncLoopResult> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  let cursor = startCursor;
  let pages = 0;
  let hasMore = true;

  while (hasMore && pages < maxPages) {
    const page = await client.sync(cursor);
    // Commit before advancing. If this throws, the cursor stays where it was
    // and the next run re-fetches — duplicates are impossible thanks to the
    // unique index on plaid_transaction_id (FR-005).
    await commit(page, page.next_cursor);
    cursor = page.next_cursor;
    hasMore = page.has_more;
    pages += 1;
  }

  return { finalCursor: cursor, pagesProcessed: pages, stoppedAtCap: hasMore };
}
