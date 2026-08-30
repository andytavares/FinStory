import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => tmpdir() } }));

const { openDatabase } = await import('@main/db/client');
const { runMigrations } = await import('@main/db/migrate');
const { DrizzleSyncStore } = await import('@main/sync/store');
const schema = await import('@main/db/schema');
const { TestClock } = await import('@shared/clock');
const { AlertType } = await import('@main/analysis/alerts');
import type { OpenedSecret, SecretBackend } from '@main/secrets/backend';
import type { DatabaseHandle } from '@main/db/client';
import type { StoredTransaction } from '@main/ingestion/apply';

class TestBackend implements SecretBackend {
  async isEncryptionAvailable(): Promise<boolean> {
    return true;
  }
  async encryptString(p: string): Promise<Buffer> {
    return Buffer.from(p, 'utf8');
  }
  async decryptString(c: Buffer): Promise<OpenedSecret> {
    return { value: c.toString('utf8'), shouldReEncrypt: false };
  }
}

const NOW = new Date('2026-08-29T12:00:00Z');
const MIGRATIONS = join(process.cwd(), 'src/main/db/migrations');

function tx(over: Partial<StoredTransaction> = {}): StoredTransaction {
  return {
    id: 'txn_1',
    plaidTransactionId: 'p1',
    accountId: 'acct_1',
    amountMinor: -4312,
    merchantName: 'Uber Eats',
    merchantKey: 'uber eats',
    description: 'UBER EATS',
    postedDate: '2026-08-29',
    datetime: '2026-08-29T11:00:00Z',
    pending: false,
    settlementState: 'posted',
    isInternalTransfer: false,
    reversesTransactionId: null,
    originalCurrency: null,
    originalAmountMinor: null,
    ...over,
  } as StoredTransaction;
}

describe('DrizzleSyncStore against a real database', () => {
  let dir: string;
  let handle: DatabaseHandle;
  let store: InstanceType<typeof DrizzleSyncStore>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'money-store-'));
    handle = await openDatabase(dir, new TestBackend());
    runMigrations(handle, MIGRATIONS);
    await handle.db.insert(schema.categories).values([
      { id: 'dining', name: 'Dining', parentId: null, isSystem: true, isHidden: false, mergedIntoId: null },
    ]);
    await handle.db.insert(schema.institutions).values({
      id: 'inst_1',
      plaidItemId: 'item_1',
      accessTokenEncrypted: 'x',
      institutionName: 'Chase',
      syncCursor: null,
      status: 'healthy',
      lastSyncedAt: null,
      lastAttemptedSyncAt: null,
      createdAt: NOW.toISOString(),
    });
    await handle.db.insert(schema.accounts).values({
      id: 'acct_1',
      institutionId: 'inst_1',
      plaidAccountId: 'pa_1',
      name: 'Checking',
      mask: '1',
      type: 'depository',
      subtype: 'checking',
      currentBalanceMinor: 1000,
      balanceAsOf: NOW.toISOString(),
      isEveryday: true,
    });
    store = new DrizzleSyncStore(handle, new TestClock(NOW));
  });

  afterEach(() => {
    handle.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists a transaction and reads it back', async () => {
    await store.saveTransactions([tx()]);
    const rows = await store.loadTransactions();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amountMinor).toBe(-4312);
  });

  it('updates in place on a repeat save rather than duplicating (FR-005, FR-006)', async () => {
    await store.saveTransactions([tx()]);
    await store.saveTransactions([tx({ amountMinor: -5000, settlementState: 'posted' })]);
    const rows = await store.loadTransactions();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amountMinor).toBe(-5000);
  });

  it('normalizes a null merchant key to an empty string', async () => {
    await store.saveTransactions([tx({ merchantKey: null as unknown as string })]);
    expect((await store.loadTransactions())[0]?.merchantKey).toBe('');
  });

  it('saves the sync cursor on the institution', async () => {
    await store.saveCursor('inst_1', 'cursor_42');
    const rows = await handle.db.select().from(schema.institutions);
    expect(rows[0]?.syncCursor).toBe('cursor_42');
  });

  it('seeds default alert rules on first read (FR-033)', async () => {
    const rules = await store.loadAlertRules();
    expect(rules.length).toBeGreaterThanOrEqual(4);
    expect(rules.map((r) => r.type)).toContain(AlertType.LargePurchase);
    // Second read returns the persisted rules, not another seed.
    expect((await store.loadAlertRules()).length).toBe(rules.length);
  });

  it('persists alerts and suppresses a duplicate dedupe key (FR-031)', async () => {
    await store.loadAlertRules();
    const fired = {
      ruleId: 'rule_large',
      type: AlertType.LargePurchase,
      triggeredByTransactionId: null,
      eventOccurredAt: NOW,
      dedupeKey: 'large_purchase:txn_1',
    };
    await store.saveAlerts([fired]);
    await store.saveAlerts([fired]);
    expect(await store.loadEmittedAlertKeys()).toEqual(['large_purchase:txn_1']);
  });

  it('supersedes a prior categorization rather than overwriting it', async () => {
    await store.saveTransactions([tx()]);
    await store.saveCategorization({
      transactionId: 'txn_1',
      categoryId: 'dining',
      confidence: 0.9,
      source: 'model',
      needsReview: false,
      reasoning: 'first',
    });
    await store.saveCategorization({
      transactionId: 'txn_1',
      categoryId: 'dining',
      confidence: 0.95,
      source: 'model',
      needsReview: false,
      reasoning: 'second',
    });
    const all = await handle.db.select().from(schema.categorizations);
    expect(all).toHaveLength(2);
    expect(all.filter((c) => c.supersededBy === null)).toHaveLength(1);
  });

  it('never overwrites a user-confirmed categorization', async () => {
    await store.saveTransactions([tx()]);
    await handle.db.insert(schema.categorizations).values({
      id: 'cat_user',
      transactionId: 'txn_1',
      categoryId: 'dining',
      confidence: 1,
      source: 'user',
      isConfirmed: true,
      needsReview: false,
      reasoning: null,
      supersededBy: null,
      createdAt: NOW.toISOString(),
    });
    await store.saveCategorization({
      transactionId: 'txn_1',
      categoryId: 'groceries',
      confidence: 0.9,
      source: 'model',
      needsReview: false,
      reasoning: 'model guess',
    });
    const live = (await handle.db.select().from(schema.categorizations)).filter(
      (c) => c.supersededBy === null,
    );
    expect(live).toHaveLength(1);
    expect(live[0]?.categoryId).toBe('dining');
  });

  it('resolves a local account id from a Plaid account id', async () => {
    expect(await store.localAccountIdFor('pa_1')).toBe('acct_1');
    expect(await store.localAccountIdFor('unknown')).toBeNull();
  });

  it('loads own account ids for transfer detection', async () => {
    expect([...(await store.loadOwnAccountIds())]).toEqual(['acct_1']);
  });

  it('marks an institution synced and healthy', async () => {
    await store.markSynced('inst_1', NOW.toISOString());
    const rows = await handle.db.select().from(schema.institutions);
    expect(rows[0]?.lastSyncedAt).toBe(NOW.toISOString());
    expect(rows[0]?.status).toBe('healthy');
  });

  it('marks a failed attempt without clearing the last success', async () => {
    await store.markSynced('inst_1', '2026-08-28T00:00:00Z');
    await store.markAttempted('inst_1', NOW.toISOString(), true);
    const rows = await handle.db.select().from(schema.institutions);
    expect(rows[0]?.status).toBe('error');
    expect(rows[0]?.lastSyncedAt).toBe('2026-08-28T00:00:00Z');
  });
});
