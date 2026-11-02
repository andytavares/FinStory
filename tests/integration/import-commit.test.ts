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
  let emitted: Array<{ channel: string; payload: unknown }>;
  let pipelineGate: Promise<void>;

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
    emitted = [];
    pipelineGate = Promise.resolve();
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
      buildPipeline: async () => {
        await pipelineGate;
        return new CategorizationPipeline(model, { confidenceThreshold: 0.8 });
      },
      describeModel: async () => ({ provider: 'anthropic', model: 'm', localOnly: false, reason: '' }),
      emit: (channel: string, payload: unknown) => emitted.push({ channel, payload }),
    });
  });

  afterEach(() => {
    handle.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('Quicken categories', () => {
    const CATEGORY_LIST = '!Type:Cat\nNPets\nE\n^\nNPets:Vet\nE\n^\nNAuto:Fuel:Premium\nE\n^\nNFood:Groceries\nE\n^\n';
    const categoriesNamed = async (name: string) =>
      (await handle.db.select().from(schema.categories)).filter((c) => c.name === name);

    it('lists categories from a QIF category list in the preview', async () => {
      const result = await preview({ fileName: 'cats.qif', text: CATEGORY_LIST });
      expect(result.categoryMappings.map((m) => [m.quickenCategory, m.count])).toEqual([
        ['Pets', 0],
        ['Pets:Vet', 0],
        ['Auto:Fuel:Premium', 0],
        ['Food:Groceries', 0],
      ]);
    });

    it('creates the categories marked new, nested one level under their parent', async () => {
      const result = await commit({
        fileName: 'cats.qif',
        text: CATEGORY_LIST,
        accountMap: [],
        categoryMap: [
          { quickenCategory: 'Pets', categoryId: 'new' },
          { quickenCategory: 'Pets:Vet', categoryId: 'new' },
          { quickenCategory: 'Auto:Fuel:Premium', categoryId: 'new' },
          { quickenCategory: 'Food:Groceries', categoryId: 'groceries' },
        ],
      });
      expect(result.createdCategories).toBe(4);
      const [pets] = await categoriesNamed('Pets');
      expect(pets?.parentId).toBeNull();
      expect((await categoriesNamed('Vet'))[0]?.parentId).toBe(pets?.id);
      // Only one level of nesting exists, so deeper Quicken levels fold into the child name.
      const [auto] = await categoriesNamed('Auto');
      expect((await categoriesNamed('Fuel › Premium'))[0]?.parentId).toBe(auto?.id);
      expect(await categoriesNamed('Pets')).toHaveLength(1);
    });

    it('reuses a category that already has the same name, and files transactions under a created one', async () => {
      const text = [
        'Date,Account,Payee,Category,Amount',
        `3/20/2026,${CHECKING},Corner Vet,Pets:Vet,-120.00`,
        `3/21/2026,${CHECKING},Whole Foods,Groceries,-30.00`,
      ].join('\n');
      const result = await commit({
        text,
        accountMap: [{ label: CHECKING, accountId: 'acct_1' }],
        categoryMap: [
          { quickenCategory: 'Pets:Vet', categoryId: 'new' },
          { quickenCategory: 'Groceries', categoryId: 'new' },
        ],
      });
      expect(result.createdCategories).toBe(2);
      expect(await categoriesNamed('Groceries')).toHaveLength(1);
      expect((await liveCategory('Whole Foods'))?.categoryId).toBe('groceries');
      const [vet] = await categoriesNamed('Vet');
      expect((await liveCategory('Corner Vet'))?.categoryId).toBe(vet?.id);
    });
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
      expect(await commit()).toEqual({ imported: 3, skippedDuplicates: 1, createdAccounts: 1, createdCategories: 0 });
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

  describe('progress', () => {
    const progressEvents = () => emitted.filter((e) => e.channel === 'import:progress').map((e) => e.payload);

    it('emits a starting event, one per new row, and a final one with the result', async () => {
      const result = await commit();
      const events = progressEvents();
      expect(events[0]).toEqual({ running: true, processed: 0, total: 0 });
      expect(events.slice(1, -1)).toEqual([1, 2, 3].map((processed) => ({ running: true, processed, total: 3 })));
      expect(events.at(-1)).toEqual({ running: false, processed: 3, total: 3, result });
    });

    it('reports a running import to a view that opens mid-way, then the result once', async () => {
      let resume = (): void => {};
      pipelineGate = new Promise<void>((resolve) => (resume = resolve));
      const running = commit();
      await vi.waitFor(() => expect(progressEvents().length).toBe(1));
      expect(await services.importStatus()).toEqual({ running: true, processed: 0, total: 0 });
      await expect(commit()).rejects.toThrow('An import is already running');

      resume();
      const result = await running;
      expect(await services.importStatus()).toEqual({ running: false, processed: 3, total: 3, result });
      expect(await services.importStatus()).toBeNull();
    });

    it('keeps the error for a view that opens after a failed import', async () => {
      const bad = [{ label: CHECKING, accountId: 'acct_missing' }, ACCOUNT_MAP[1]];
      await expect(commit({ accountMap: bad })).rejects.toThrow();
      expect(await services.importStatus()).toMatchObject({ running: false, error: expect.any(String) });
    });
  });

  it('leaves imported institutions out of the Plaid sync set', async () => {
    await commit();
    expect((await handle.db.select().from(schema.institutions)).length).toBe(2);
    expect((await selectPlaidInstitutions(handle.db)).map((i) => i.id)).toEqual(['inst_1']);
  });
});
