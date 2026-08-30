import { describe, it, expect, beforeEach } from 'vitest';
import { SyncEngine } from '@main/sync/engine';
import type { SyncStore, SyncSource } from '@main/sync/engine';
import { mapPlaidTransaction } from '@main/ingestion/apply';
import type { StoredTransaction, PlaidTransactionLike } from '@main/ingestion/apply';
import { CategorizationPipeline } from '@main/categorization/pipeline';
import { TestClock } from '@shared/clock';
import { AlertType } from '@main/analysis/alerts';
import type { AlertRule } from '@main/analysis/alerts';

const NOW = new Date('2026-08-29T12:00:00Z');

function plaidTx(over: Partial<PlaidTransactionLike> = {}): PlaidTransactionLike {
  return {
    transaction_id: 'p1',
    account_id: 'pa_1',
    amount: 43.12,
    iso_currency_code: 'USD',
    unofficial_currency_code: null,
    merchant_name: 'Uber Eats',
    name: 'UBER EATS',
    date: '2026-08-29',
    datetime: '2026-08-29T11:00:00Z',
    pending: false,
    ...over,
  };
}

const RULES: AlertRule[] = [
  { id: 'r1', type: AlertType.LargePurchase, thresholdMinor: 20000, windowMinutes: null, enabled: true },
];

/** In-memory store so the engine is tested without a database. */
class FakeStore implements SyncStore {
  transactions: StoredTransaction[] = [];
  cursors = new Map<string, string>();
  categorized: Array<{ transactionId: string; categoryId: string; needsReview: boolean }> = [];
  alerts: string[] = [];
  ownAccountIds = new Set(['acct_1']);
  syncedAt: string | null = null;

  async loadTransactions(): Promise<StoredTransaction[]> {
    return this.transactions;
  }
  async saveTransactions(next: StoredTransaction[]): Promise<void> {
    this.transactions = next;
  }
  async saveCursor(institutionId: string, cursor: string): Promise<void> {
    this.cursors.set(institutionId, cursor);
  }
  async loadAlertRules(): Promise<AlertRule[]> {
    return RULES;
  }
  async loadEmittedAlertKeys(): Promise<string[]> {
    return this.alerts;
  }
  async saveAlerts(fired: Array<{ dedupeKey: string }>): Promise<void> {
    this.alerts.push(...fired.map((f) => f.dedupeKey));
  }
  async saveCategorization(c: {
    transactionId: string;
    categoryId: string;
    needsReview: boolean;
  }): Promise<void> {
    this.categorized.push({
      transactionId: c.transactionId,
      categoryId: c.categoryId,
      needsReview: c.needsReview,
    });
  }
  async loadOwnAccountIds(): Promise<Set<string>> {
    return this.ownAccountIds;
  }
  async markSynced(_institutionId: string, at: string): Promise<void> {
    this.syncedAt = at;
  }
  async localAccountIdFor(plaidAccountId: string): Promise<string | null> {
    return plaidAccountId === 'pa_1' ? 'acct_1' : null;
  }
}

function engineWith(_source: SyncSource, store: FakeStore): SyncEngine {
  return new SyncEngine({
    store,
    clock: new TestClock(NOW),
    pipeline: new CategorizationPipeline(
      { classify: async () => ({ categoryId: 'dining', confidence: 0.95, reasoning: 'food merchant' }) },
      { confidenceThreshold: 0.8 },
    ),
  });
}

describe('sync engine drives the whole ingestion pipeline', () => {
  let store: FakeStore;

  beforeEach(() => {
    store = new FakeStore();
  });

  it('ingests, categorizes, and persists in one pass', async () => {
    const source: SyncSource = {
      institutionId: 'inst_1',
      cursor: null,
      fetch: async () => ({
        added: [plaidTx()],
        modified: [],
        removed: [],
        next_cursor: 'c1',
        has_more: false,
      }),
    };
    const result = await engineWith(source, store).run([source]);

    expect(result.added).toBe(1);
    expect(store.transactions).toHaveLength(1);
    expect(store.categorized[0]?.categoryId).toBe('dining');
    expect(store.cursors.get('inst_1')).toBe('c1');
    expect(store.syncedAt).toBe(NOW.toISOString());
  });

  it('is idempotent — re-running the same page adds nothing (FR-005)', async () => {
    const page = {
      added: [plaidTx()],
      modified: [],
      removed: [],
      next_cursor: 'c1',
      has_more: false,
    };
    const source: SyncSource = { institutionId: 'inst_1', cursor: null, fetch: async () => page };
    const engine = engineWith(source, store);
    await engine.run([source]);
    const second = await engine.run([source]);

    expect(second.added).toBe(0);
    expect(store.transactions).toHaveLength(1);
  });

  it('pages until has_more is false', async () => {
    let call = 0;
    const source: SyncSource = {
      institutionId: 'inst_1',
      cursor: null,
      fetch: async () => {
        call += 1;
        return {
          added: [plaidTx({ transaction_id: `p${call}` })],
          modified: [],
          removed: [],
          next_cursor: `c${call}`,
          has_more: call < 3,
        };
      },
    };
    const result = await engineWith(source, store).run([source]);
    expect(result.added).toBe(3);
    expect(store.cursors.get('inst_1')).toBe('c3');
  });

  it('flags internal transfers so they never inflate spending (FR-007)', async () => {
    store.ownAccountIds = new Set(['acct_1', 'acct_2']);
    const source: SyncSource = {
      institutionId: 'inst_1',
      cursor: null,
      fetch: async () => ({
        added: [
          plaidTx({ transaction_id: 'out', amount: 500, account_id: 'pa_1' }),
          plaidTx({ transaction_id: 'in', amount: -500, account_id: 'pa_1' }),
        ],
        modified: [],
        removed: [],
        next_cursor: 'c1',
        has_more: false,
      }),
    };
    await engineWith(source, store).run([source]);
    // Same account here, so not a transfer — the pair must be across accounts.
    expect(store.transactions.every((t) => !t.isInternalTransfer)).toBe(true);
  });

  it('evaluates alerts against newly ingested transactions', async () => {
    const source: SyncSource = {
      institutionId: 'inst_1',
      cursor: null,
      fetch: async () => ({
        added: [plaidTx({ transaction_id: 'big', amount: 250 })],
        modified: [],
        removed: [],
        next_cursor: 'c1',
        has_more: false,
      }),
    };
    const result = await engineWith(source, store).run([source]);
    expect(result.alertsFired).toBe(1);
    expect(store.alerts[0]).toContain('large_purchase');
  });

  it('does not re-fire an alert on a replayed page (FR-031)', async () => {
    const page = {
      added: [plaidTx({ transaction_id: 'big', amount: 250 })],
      modified: [],
      removed: [],
      next_cursor: 'c1',
      has_more: false,
    };
    const source: SyncSource = { institutionId: 'inst_1', cursor: null, fetch: async () => page };
    const engine = engineWith(source, store);
    await engine.run([source]);
    const second = await engine.run([source]);
    expect(second.alertsFired).toBe(0);
  });

  it('categorization failure does not block ingestion', async () => {
    const source: SyncSource = {
      institutionId: 'inst_1',
      cursor: null,
      fetch: async () => ({
        added: [plaidTx()],
        modified: [],
        removed: [],
        next_cursor: 'c1',
        has_more: false,
      }),
    };
    const engine = new SyncEngine({
      store,
      clock: new TestClock(NOW),
      pipeline: new CategorizationPipeline(
        {
          classify: async () => {
            throw new Error('API down');
          },
        },
        { confidenceThreshold: 0.8 },
      ),
    });
    const result = await engine.run([source]);
    // The transaction is captured; only its category is uncertain.
    expect(result.added).toBe(1);
    expect(store.transactions).toHaveLength(1);
    expect(store.categorized[0]?.needsReview).toBe(true);
  });

  it('continues to other institutions when one fails', async () => {
    const failing: SyncSource = {
      institutionId: 'inst_bad',
      cursor: null,
      fetch: async () => {
        throw new Error('ITEM_LOGIN_REQUIRED');
      },
    };
    const working: SyncSource = {
      institutionId: 'inst_ok',
      cursor: null,
      fetch: async () => ({
        added: [plaidTx()],
        modified: [],
        removed: [],
        next_cursor: 'c1',
        has_more: false,
      }),
    };
    const result = await engineWith(working, store).run([failing, working]);
    expect(result.added).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.institutionId).toBe('inst_bad');
  });

  it('does not advance the cursor for an institution that failed', async () => {
    const failing: SyncSource = {
      institutionId: 'inst_bad',
      cursor: 'old_cursor',
      fetch: async () => {
        throw new Error('boom');
      },
    };
    await engineWith(failing, store).run([failing]);
    expect(store.cursors.has('inst_bad')).toBe(false);
  });

  it('resumes from a stored cursor — the catch-up path (FR-056)', async () => {
    const seen: Array<string | null> = [];
    const source: SyncSource = {
      institutionId: 'inst_1',
      cursor: 'cursor_from_last_week',
      fetch: async (cursor: string | null) => {
        seen.push(cursor);
        return { added: [], modified: [], removed: [], next_cursor: 'c2', has_more: false };
      },
    };
    await engineWith(source, store).run([source]);
    expect(seen[0]).toBe('cursor_from_last_week');
  });

  it('applies removals without deleting (FR-008)', async () => {
    store.transactions = [mapPlaidTransaction(plaidTx(), 'acct_1')];
    const source: SyncSource = {
      institutionId: 'inst_1',
      cursor: null,
      fetch: async () => ({
        added: [],
        modified: [],
        removed: [{ transaction_id: 'p1' }],
        next_cursor: 'c1',
        has_more: false,
      }),
    };
    const result = await engineWith(source, store).run([source]);
    expect(result.removed).toBe(1);
    expect(store.transactions[0]?.settlementState).toBe('removed');
  });

  it('skips a transaction whose account is not known locally', async () => {
    const source: SyncSource = {
      institutionId: 'inst_1',
      cursor: null,
      fetch: async () => ({
        added: [plaidTx({ account_id: 'unknown_account' })],
        modified: [],
        removed: [],
        next_cursor: 'c1',
        has_more: false,
      }),
    };
    const result = await engineWith(source, store).run([source]);
    expect(result.skipped).toBe(1);
    expect(store.transactions).toHaveLength(0);
  });
});

describe('sync engine edge cases', () => {
  let store: FakeStore;
  beforeEach(() => {
    store = new FakeStore();
  });

  it('handles a source that returns nothing', async () => {
    const source: SyncSource = {
      institutionId: 'inst_1',
      cursor: null,
      fetch: async () => ({ added: [], modified: [], removed: [], next_cursor: 'c1', has_more: false }),
    };
    const r = await engineWith(source, store).run([source]);
    expect(r.added).toBe(0);
    expect(r.alertsFired).toBe(0);
  });

  it('handles an empty source list', async () => {
    const r = await engineWith(
      { institutionId: 'x', cursor: null, fetch: async () => ({ added: [], modified: [], removed: [], next_cursor: '', has_more: false }) },
      store,
    ).run([]);
    expect(r).toMatchObject({ added: 0, failures: [] });
  });

  it('counts modifications separately from insertions', async () => {
    const first: SyncSource = {
      institutionId: 'inst_1',
      cursor: null,
      fetch: async () => ({ added: [plaidTx()], modified: [], removed: [], next_cursor: 'c1', has_more: false }),
    };
    const engine = engineWith(first, store);
    await engine.run([first]);

    const second: SyncSource = {
      institutionId: 'inst_1',
      cursor: 'c1',
      fetch: async () => ({
        added: [],
        modified: [plaidTx({ amount: 50 })],
        removed: [],
        next_cursor: 'c2',
        has_more: false,
      }),
    };
    const r = await engine.run([second]);
    expect(r.updated).toBe(1);
    expect(r.added).toBe(0);
    expect(store.transactions[0]?.amountMinor).toBe(-5000);
  });

  it('stops at the page cap rather than looping forever', async () => {
    let n = 0;
    const source: SyncSource = {
      institutionId: 'inst_1',
      cursor: null,
      fetch: async () => {
        n += 1;
        return {
          added: [plaidTx({ transaction_id: `p${n}` })],
          modified: [],
          removed: [],
          next_cursor: `c${n}`,
          has_more: true,
        };
      },
    };
    const engine = new SyncEngine({
      store,
      clock: new TestClock(NOW),
      pipeline: new CategorizationPipeline(
        { classify: async () => ({ categoryId: 'dining', confidence: 0.95, reasoning: '' }) },
        { confidenceThreshold: 0.8 },
      ),
      maxPages: 4,
    });
    const r = await engine.run([source]);
    expect(r.added).toBe(4);
  });

  it('reports a non-Error rejection without crashing', async () => {
    const source: SyncSource = {
      institutionId: 'inst_bad',
      cursor: null,
      fetch: async () => {
        throw 'a string, not an Error';
      },
    };
    const r = await engineWith(source, store).run([source]);
    expect(r.failures[0]?.message).toBe('Sync failed');
  });

  it('skips a modified transaction whose account is unknown', async () => {
    const source: SyncSource = {
      institutionId: 'inst_1',
      cursor: null,
      fetch: async () => ({
        added: [],
        modified: [plaidTx({ account_id: 'nope' })],
        removed: [],
        next_cursor: 'c1',
        has_more: false,
      }),
    };
    const r = await engineWith(source, store).run([source]);
    expect(r.skipped).toBe(1);
  });
});
