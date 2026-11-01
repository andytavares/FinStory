import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => tmpdir() } }));

const { openDatabase } = await import('@main/db/client');
const { runMigrations } = await import('@main/db/migrate');
const { DrizzleSyncStore } = await import('@main/sync/store');
const { SyncEngine } = await import('@main/sync/engine');
const { CategorizationPipeline } = await import('@main/categorization/pipeline');
const { defaultCategories } = await import('@main/db/seed-categories');
const schema = await import('@main/db/schema');
const { TestClock } = await import('@shared/clock');
import type { DatabaseHandle } from '@main/db/client';
import { MemorySecretStore } from '../fixtures/memory-secret-store';

const NOW = new Date('2026-08-29T12:00:00Z');
const MIGRATIONS = join(process.cwd(), 'src/main/db/migrations');

function plaid(n: number, account = 'pa_1') {
  return {
    transaction_id: `p${n}`,
    account_id: account,
    amount: 12.34,
    iso_currency_code: 'USD',
    unofficial_currency_code: null,
    merchant_name: `Merchant ${n}`,
    name: `MERCHANT ${n}`,
    date: '2026-08-20',
    datetime: null,
    pending: false,
  };
}

describe('sync survives a taxonomy the user has changed', () => {
  let dir: string;
  let handle: DatabaseHandle;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'money-fk-'));
    handle = await openDatabase(dir, new MemorySecretStore());
    runMigrations(handle, MIGRATIONS);
    await handle.db.insert(schema.categories).values(defaultCategories());
    await handle.db.insert(schema.institutions).values({
      id: 'inst_1', plaidItemId: 'item_1', accessTokenEncrypted: 'x',
      institutionName: 'Chase', syncCursor: null, status: 'healthy',
      lastSyncedAt: null, lastAttemptedSyncAt: null, createdAt: NOW.toISOString(),
    });
    await handle.db.insert(schema.accounts).values({
      id: 'acct_1', institutionId: 'inst_1', plaidAccountId: 'pa_1', name: 'Checking',
      mask: '1', type: 'depository', subtype: 'checking', currentBalanceMinor: 1000,
      balanceAsOf: NOW.toISOString(), isEveryday: true,
    });
  });
  afterEach(() => { handle.close(); rmSync(dir, { recursive: true, force: true }); });

  function engine() {
    return new SyncEngine({
      store: new DrizzleSyncStore(handle, new TestClock(NOW)),
      clock: new TestClock(NOW),
      pipeline: new CategorizationPipeline(
        { classify: () => Promise.reject(new Error('no model')) },
        { confidenceThreshold: 0.8, localOnly: true },
      ),
    });
  }

  it('does not die when the user deletes a category the heuristics name', async () => {
    // The user can delete predefined categories. Heuristics name category ids
    // literally, so a Starbucks charge still resolves to 'coffee'.
    await handle.raw.prepare("DELETE FROM categories WHERE id = 'coffee'").run();
    const starbucks = { ...plaid(9), merchant_name: 'Starbucks', name: 'STARBUCKS #4471' };
    const r = await engine().run([{
      institutionId: 'inst_1', cursor: null,
      fetch: async () => ({ added: [starbucks], modified: [], removed: [], next_cursor: 'c1', has_more: false }),
    }]);
    expect(r.failures).toEqual([]);
    expect(r.added).toBe(1);
    const stored = handle.raw
      .prepare('SELECT category_id, needs_review FROM categorizations')
      .all() as Array<{ category_id: string; needs_review: number }>;
    expect(stored).toEqual([{ category_id: 'uncategorizable', needs_review: 1 }]);
  });

  it('does not die when the model returns a category outside the taxonomy', async () => {
    const inventing = new SyncEngine({
      store: new DrizzleSyncStore(handle, new TestClock(NOW)),
      clock: new TestClock(NOW),
      pipeline: new CategorizationPipeline(
        { classify: async () => ({ categoryId: 'crypto-gambling', confidence: 0.95, reasoning: '' }) },
        { confidenceThreshold: 0.8 },
      ),
    });
    const r = await inventing.run([{
      institutionId: 'inst_1', cursor: null,
      fetch: async () => ({ added: [plaid(1)], modified: [], removed: [], next_cursor: 'c1', has_more: false }),
    }]);
    expect(r.failures).toEqual([]);
    expect(r.added).toBe(1);
    const stored = handle.raw
      .prepare('SELECT category_id FROM categorizations')
      .all() as Array<{ category_id: string }>;
    expect(stored).toEqual([{ category_id: 'uncategorizable' }]);
  });

  it('keeps a valid category when the taxonomy is intact', async () => {
    const starbucks = { ...plaid(9), merchant_name: 'Starbucks', name: 'STARBUCKS #4471' };
    const r = await engine().run([{
      institutionId: 'inst_1', cursor: null,
      fetch: async () => ({ added: [starbucks], modified: [], removed: [], next_cursor: 'c1', has_more: false }),
    }]);
    expect(r.failures).toEqual([]);
    const stored = handle.raw
      .prepare('SELECT category_id FROM categorizations')
      .all() as Array<{ category_id: string }>;
    expect(stored).toEqual([{ category_id: 'coffee' }]);
  });

  it('first sync of one page', async () => {
    const r = await engine().run([{
      institutionId: 'inst_1', cursor: null,
      fetch: async () => ({ added: [plaid(1), plaid(2)], modified: [], removed: [], next_cursor: 'c1', has_more: false }),
    }]);
    expect(r.failures).toEqual([]);
  });

  it('second sync re-saving existing rows', async () => {
    await engine().run([{
      institutionId: 'inst_1', cursor: null,
      fetch: async () => ({ added: [plaid(1), plaid(2)], modified: [], removed: [], next_cursor: 'c1', has_more: false }),
    }]);
    const r = await engine().run([{
      institutionId: 'inst_1', cursor: 'c1',
      fetch: async () => ({ added: [plaid(3)], modified: [plaid(1)], removed: [], next_cursor: 'c2', has_more: false }),
    }]);
    expect(r.failures).toEqual([]);
  });

  it('multi-page sync', async () => {
    let call = 0;
    const r = await engine().run([{
      institutionId: 'inst_1', cursor: null,
      fetch: async () => {
        call += 1;
        return call === 1
          ? { added: [plaid(1), plaid(2)], modified: [], removed: [], next_cursor: 'c1', has_more: true }
          : { added: [plaid(3)], modified: [], removed: [], next_cursor: 'c2', has_more: false };
      },
    }]);
    expect(r.failures).toEqual([]);
  });

  it('a transaction on an account we do not know', async () => {
    const r = await engine().run([{
      institutionId: 'inst_1', cursor: null,
      fetch: async () => ({ added: [plaid(1), plaid(2, 'pa_UNKNOWN')], modified: [], removed: [], next_cursor: 'c1', has_more: false }),
    }]);
    expect(r.failures).toEqual([]);
  });
});
