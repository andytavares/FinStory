import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
  dialog: { showSaveDialog: async () => ({ canceled: true }), showOpenDialog: async () => ({ canceled: true }) },
  shell: { openExternal: async () => {} },
}));

const { openDatabase } = await import('@main/db/client');
const { runMigrations } = await import('@main/db/migrate');
const { Services } = await import('@main/services/index');
const { defaultCategories } = await import('@main/db/seed-categories');
const schema = await import('@main/db/schema');
const { DiagnosticLogger } = await import('@main/diagnostics/logger');
const { MemorySink } = await import('@main/diagnostics/sink');
const { CategorizationPipeline } = await import('@main/categorization/pipeline');
const { TestClock } = await import('@shared/clock');
const { EMPTY_SYNC } = await import('@main/sync/outcome');
const { selectPlaidInstitutions } = await import('@main/import/institutions');
import type { DatabaseHandle } from '@main/db/client';
import type { ImportPreview, ImportResult } from '@shared/types';
import { MemorySecretStore } from '../fixtures/memory-secret-store';

const MIGRATIONS = join(process.cwd(), 'src/main/db/migrations');
const NOW = new Date('2026-08-29T12:00:00Z');
const CHECKING = 'Everyday Checking ••4321';
const CSV = [
  'Date,Account,Payee,Category,Memo,Amount,Check #',
  `3/12/2026,${CHECKING},Starbucks #123,Food:Coffee,,-4.50,`,
  `3/1/2026,${CHECKING},Whole Foods,Food:Groceries,,-80.00,`,
  '3/2/2026,Old Savings,Paycheck,Income:Salary,,1000.00,',
  '3/3/2026,Old Savings,Mystery Vendor,,,-9.99,',
].join('\n');
const ACCOUNT_MAP = [
  { label: CHECKING, accountId: 'acct_1' },
  { label: 'Old Savings', accountId: 'new', newName: 'Old Savings' },
];
const CATEGORY_MAP = [
  { quickenCategory: 'Food:Groceries', categoryId: 'groceries' },
  { quickenCategory: 'Income:Salary', categoryId: 'income' },
];

async function seedLedger(handle: DatabaseHandle): Promise<void> {
    const db = handle.db;
    await db.insert(schema.categories).values(defaultCategories());
    await db.insert(schema.institutions).values({
      id: 'inst_1', plaidItemId: 'item_1', accessTokenEncrypted: '', institutionName: 'Chase',
      status: 'healthy', createdAt: '2026-01-01T00:00:00Z',
    });
    await db.insert(schema.accounts).values({
      id: 'acct_1', institutionId: 'inst_1', plaidAccountId: 'pa_1', name: 'Everyday Checking',
      mask: '4321', type: 'depository', subtype: 'checking', isEveryday: true,
    });
    await db.insert(schema.transactions).values({
      id: 'txn_1', accountId: 'acct_1', plaidTransactionId: 'pt_1', amountMinor: -450,
      merchantName: 'Starbucks', merchantKey: 'starbucks', description: 'STARBUCKS',
      postedDate: '2026-03-10', firstSeenAt: '2026-03-10', updatedAt: '2026-03-10',
    });
}

describe('Quicken import', () => {
  let dir: string;
  let handle: DatabaseHandle;
  let services: InstanceType<typeof Services>;
  let modelCalls: number;

  const file = { fileName: 'register.csv', text: CSV };
  const commit = (over: Record<string, unknown> = {}) =>
    services.commitImport({ ...file, accountMap: ACCOUNT_MAP, categoryMap: CATEGORY_MAP, ...over }) as Promise<ImportResult>;
  const preview = (over: Record<string, unknown> = {}) =>
    services.previewImport({ ...file, ...over }) as Promise<ImportPreview>;
  const liveCategory = async (payee: string) => {
    const tx = (await handle.db.select().from(schema.transactions)).find((r) => r.merchantName === payee);
    const rows = await handle.db.select().from(schema.categorizations);
    return rows.find((c) => c.transactionId === tx?.id);
  };

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'money-import-'));
    handle = await openDatabase(dir, new MemorySecretStore());
    runMigrations(handle, MIGRATIONS);
    await seedLedger(handle);
    modelCalls = 0;
    const model = {
      classify: async () => {
        modelCalls += 1;
        return { categoryId: 'dining', confidence: 0.95, reasoning: 'model' };
      },
    };
    services = new Services({
      handle,
      userDataDir: dir,
      clock: new TestClock(NOW),
      logger: new DiagnosticLogger(new MemorySink(), new TestClock(NOW)),
      store: new MemorySecretStore(),
      pipeline: new CategorizationPipeline(model, { confidenceThreshold: 0.8 }),
      sync: async () => EMPTY_SYNC,
      buildPipeline: async () => new CategorizationPipeline(model, { confidenceThreshold: 0.8 }),
      describeModel: async () => ({ provider: 'anthropic', model: 'm', localOnly: false, reason: '' }),
      emit: () => {},
    });
  });

  afterEach(() => {
    handle.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('preview', () => {
    it('counts rows already present by amount, date and payee as duplicates', async () => {
      const result = await preview();
      expect(result).toMatchObject({ format: 'csv', newCount: 3, duplicateCount: 1, needsMapping: false });
    });

    it('suggests the account by mask and categories by name', async () => {
      const result = await preview();
      expect(result.accounts.map((a) => a.suggestedAccountId)).toEqual(['acct_1', null]);
      expect(result.categoryMappings).toEqual([
        { quickenCategory: 'Food:Coffee', count: 1, suggestedCategoryId: 'coffee' },
        { quickenCategory: 'Food:Groceries', count: 1, suggestedCategoryId: 'groceries' },
        { quickenCategory: 'Income:Salary', count: 1, suggestedCategoryId: null },
      ]);
    });

    it('does not call a purchase a duplicate when the payee differs or the date is over 3 days away', async () => {
      const text = [
        'Date,Account,Payee,Amount',
        `3/12/2026,${CHECKING},Dunkin,-4.50`,
        `3/14/2026,${CHECKING},Starbucks,-4.50`,
      ].join('\n');
      const result = await preview({ text });
      expect(result).toMatchObject({ newCount: 2, duplicateCount: 0 });
    });

    it('asks for a column mapping when no header row is found', async () => {
      const result = await preview({ text: 'a,b,c\n1,2,3' });
      expect(result).toMatchObject({ needsMapping: true, headers: ['a', 'b', 'c'] });
    });
  });

  describe('commit', () => {
    it('inserts rows, creates the new account and skips the duplicate', async () => {
      expect(await commit()).toEqual({ imported: 3, skippedDuplicates: 1, createdAccounts: 1 });
      const imported = (await handle.db.select().from(schema.institutions)).find((i) => i.source === 'import');
      expect(imported).toMatchObject({ plaidItemId: null, status: 'healthy', accessTokenEncrypted: '' });
      const created = (await handle.db.select().from(schema.accounts)).find((a) => a.name === 'Old Savings');
      expect(created).toMatchObject({ institutionId: imported?.id, isEveryday: false });
    });

    it('imports again as all duplicates and inserts nothing', async () => {
      await commit();
      const before = (await handle.db.select().from(schema.transactions)).length;
      const accountsBefore = (await handle.db.select().from(schema.accounts)).length;
      expect(await commit()).toMatchObject({ imported: 0, skippedDuplicates: 4, createdAccounts: 0 });
      expect((await handle.db.select().from(schema.transactions)).length).toBe(before);
      expect((await handle.db.select().from(schema.accounts)).length).toBe(accountsBefore);
      expect(await preview()).toMatchObject({ newCount: 0, duplicateCount: 4 });
    });

    it('keeps two identical purchases on one day', async () => {
      const text = `Date,Account,Payee,Amount\n3/5/2026,Cash,Bus fare,-2.00\n3/5/2026,Cash,Bus fare,-2.00`;
      const map = [{ label: 'Cash', accountId: 'new' }];
      expect(await commit({ text, accountMap: map, categoryMap: [] })).toMatchObject({ imported: 2 });
      expect(await commit({ text, accountMap: map, categoryMap: [] })).toMatchObject({ imported: 0, skippedDuplicates: 2 });
    });

    it('lets a merchant rule beat a mapped Quicken category', async () => {
      await handle.db.insert(schema.merchantProfiles).values({
        merchantKey: 'whole foods', categoryDistribution: '{}', userConfirmedCategoryId: 'home',
        transactionCount: 0, lastUpdatedAt: '2026-01-01',
      });
      await commit();
      expect(await liveCategory('Whole Foods')).toMatchObject({ categoryId: 'home', source: 'rule' });
    });

    it('lets a mapped Quicken category beat the model', async () => {
      await commit();
      expect(await liveCategory('Paycheck')).toMatchObject({
        categoryId: 'income', source: 'local_history', confidence: 0.9,
      });
      expect(modelCalls).toBe(1);
      expect(await liveCategory('Mystery Vendor')).toMatchObject({ categoryId: 'dining', source: 'model' });
    });

    it('rolls everything back when an insert fails', async () => {
      const bad = [{ label: CHECKING, accountId: 'acct_missing' }, ACCOUNT_MAP[1]];
      await expect(commit({ accountMap: bad })).rejects.toThrow();
      expect((await handle.db.select().from(schema.transactions)).length).toBe(1);
      expect((await handle.db.select().from(schema.accounts)).length).toBe(1);
      expect((await handle.db.select().from(schema.institutions)).length).toBe(1);
    });
  });

  it('leaves imported institutions out of the Plaid sync set', async () => {
    await commit();
    expect((await handle.db.select().from(schema.institutions)).length).toBe(2);
    expect((await selectPlaidInstitutions(handle.db)).map((i) => i.id)).toEqual(['inst_1']);
  });
});
