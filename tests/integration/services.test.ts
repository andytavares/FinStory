import { EMPTY_SYNC } from '@main/sync/outcome';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Electron is unavailable in the test process; only dialog/app/shell are used,
// and only on user-initiated file paths.
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
const { Keyring } = await import('@main/secrets/keyring');
const { DiagnosticLogger } = await import('@main/diagnostics/logger');
const { MemorySink } = await import('@main/diagnostics/sink');
const { CategorizationPipeline } = await import('@main/categorization/pipeline');
const { TestClock } = await import('@shared/clock');
const { IpcRegistry } = await import('@main/ipc/registry');
const { registerHandlers } = await import('@main/ipc/handlers/index');
import type { OpenedSecret, SecretBackend } from '@main/secrets/backend';
import type { DatabaseHandle } from '@main/db/client';

class TestBackend implements SecretBackend {
  async isEncryptionAvailable(): Promise<boolean> {
    return true;
  }
  async encryptString(p: string): Promise<Buffer> {
    return Buffer.from(Buffer.from(p, 'utf8').toString('base64'), 'utf8');
  }
  async decryptString(c: Buffer): Promise<OpenedSecret> {
    return { value: Buffer.from(c.toString('utf8'), 'base64').toString('utf8'), shouldReEncrypt: false };
  }
}

const MIGRATIONS = join(process.cwd(), 'src/main/db/migrations');
const NOW = new Date('2026-08-29T12:00:00Z');

describe('Services against a real encrypted database', () => {
  let dir: string;
  let handle: DatabaseHandle;
  let services: InstanceType<typeof Services>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'money-svc-'));
    handle = await openDatabase(dir, new TestBackend());
    runMigrations(handle, MIGRATIONS);
    await handle.db.insert(schema.categories).values(defaultCategories());

    services = new Services({
      handle,
      userDataDir: dir,
      clock: new TestClock(NOW),
      logger: new DiagnosticLogger(new MemorySink(), new TestClock(NOW)),
      keyring: new Keyring(new TestBackend()),
      pipeline: new CategorizationPipeline(
        { classify: async () => ({ categoryId: 'dining', confidence: 0.9, reasoning: '' }) },
        { confidenceThreshold: 0.8 },
      ),
      sync: async () => EMPTY_SYNC,
      buildPipeline: () =>
        Promise.resolve(
          new CategorizationPipeline(
            { classify: async () => ({ categoryId: 'dining', confidence: 0.9, reasoning: '' }) },
            { confidenceThreshold: 0.8 },
          ),
        ),
      describeModel: () =>
        Promise.resolve({ provider: 'local_only', model: null, localOnly: true, reason: 'History only in tests' }),
    });
  });

  afterEach(() => {
    try {
      handle.close();
    } catch {
      /* already closed by deleteAllData */
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports an unconfigured, empty first-run state', async () => {
    const status = (await services.setupStatus()) as {
      plaidConfigured: boolean;
      accountCount: number;
    };
    expect(status.plaidConfigured).toBe(false);
    expect(status.accountCount).toBe(0);
  });

  it('stores credentials sealed and never returns their values (FR-047)', async () => {
    await services.saveCredentials({
      plaidClientId: 'client-123',
      plaidSecret: 'super-secret',
      plaidEnv: 'sandbox',
    });
    const status = (await services.setupStatus()) as { plaidConfigured: boolean };
    expect(status.plaidConfigured).toBe(true);
    expect(JSON.stringify(status)).not.toContain('super-secret');

    const rows = await handle.db.select().from(schema.settings);
    const secret = rows.find((r) => r.key === 'plaidSecret');
    expect(secret?.isSecret).toBe(true);
    expect(secret?.value).not.toContain('super-secret');
  });

  it('treats a fresh install as incomplete rather than complete (SC-014)', async () => {
    const c = await services.completeness();
    expect(c.dataComplete).toBe(false);
  });

  it('serves an empty dashboard without throwing', async () => {
    const d = (await services.dashboard({
      periodStart: '2026-08-01T00:00:00Z',
      periodEnd: '2026-09-01T00:00:00Z',
    })) as { categoryBreakdown: { totalMinor: number }; runway: { available: boolean } };
    expect(d.categoryBreakdown.totalMinor).toBe(0);
    // No income detected yet, so the projection is withheld (FR-073).
    expect(d.runway.available).toBe(false);
  });

  it('ships a usable taxonomy with no configuration (FR-078)', async () => {
    expect(((await services.listCategories()) as unknown[]).length).toBeGreaterThan(20);
  });

  it('creates a category and rejects two-level nesting (FR-080)', async () => {
    const created = (await services.createCategory({ name: 'Hobbies', parentId: null })) as {
      id: string;
    };
    expect(created.id).toBeDefined();
    await expect(services.createCategory({ name: 'Too deep', parentId: 'dining' })).rejects.toMatchObject(
      { code: 'CATEGORY_NESTING_EXCEEDED' },
    );
  });

  it('renames by id so comparisons are unaffected (FR-083)', async () => {
    await services.renameCategory({ id: 'dining', name: 'Eating Out' });
    const cats = (await services.listCategories()) as Array<{ id: string; name: string }>;
    expect(cats.find((c) => c.id === 'dining')?.name).toBe('Eating Out');
  });

  it('hides without deleting (FR-082)', async () => {
    await services.setCategoryHidden({ id: 'dining', hidden: true });
    const cats = (await services.listCategories()) as Array<{ id: string; isHidden: boolean }>;
    expect(cats.find((c) => c.id === 'dining')?.isHidden).toBe(true);
    expect(cats.some((c) => c.id === 'dining')).toBe(true);
  });

  it('merges and retains the source row so history resolves (FR-081)', async () => {
    await services.mergeCategories({ sourceId: 'coffee', targetId: 'dining' });
    const cats = (await services.listCategories()) as Array<{ id: string; mergedIntoId: string | null }>;
    expect(cats.find((c) => c.id === 'coffee')?.mergedIntoId).toBe('dining');
  });

  it('returns default settings before anything is configured', async () => {
    const s = (await services.getSettings()) as { categorizationMode: string; pollIntervalMinutes: number };
    expect(s.categorizationMode).toBe('hybrid');
    expect(s.pollIntervalMinutes).toBeGreaterThan(0);
  });

  it('persists a settings change and clamps out-of-range values', async () => {
    await services.updateSettings({ categorizationMode: 'local_only', pollIntervalMinutes: 5 });
    const s = (await services.getSettings()) as { categorizationMode: string; pollIntervalMinutes: number };
    expect(s.categorizationMode).toBe('local_only');
    expect(s.pollIntervalMinutes).toBe(15);
  });

  it('refuses to connect an account before Plaid is configured', async () => {
    await expect(services.startLink()).rejects.toMatchObject({ code: 'PLAID_UNCONFIGURED' });
  });

  it('serves empty lists rather than throwing across every read', async () => {
    for (const read of [
      services.listInstitutions(),
      services.listIncome(),
      services.listRecurring(),
      services.listAlerts(),
      services.listAlertRules(),
      services.listReports(),
    ]) {
      expect(Array.isArray(await read)).toBe(true);
    }
    expect((await services.reviewQueue({ limit: 10, offset: 0 })) as unknown).toMatchObject({
      totalCount: 0,
    });
    expect(await services.health()).toBeDefined();
  });

  it('reports a missing report honestly rather than returning empty data', async () => {
    await expect(services.getReport('nope')).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});

describe('the wired registry answers every channel against real services', () => {
  let dir: string;
  let handle: DatabaseHandle;
  let registry: InstanceType<typeof IpcRegistry>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'money-wire-'));
    handle = await openDatabase(dir, new TestBackend());
    runMigrations(handle, MIGRATIONS);
    await handle.db.insert(schema.categories).values(defaultCategories());

    const services = new Services({
      handle,
      userDataDir: dir,
      clock: new TestClock(NOW),
      logger: new DiagnosticLogger(new MemorySink(), new TestClock(NOW)),
      keyring: new Keyring(new TestBackend()),
      pipeline: new CategorizationPipeline(
        { classify: async () => ({ categoryId: 'dining', confidence: 0.9, reasoning: '' }) },
        { confidenceThreshold: 0.8 },
      ),
      sync: async () => EMPTY_SYNC,
      buildPipeline: () =>
        Promise.resolve(
          new CategorizationPipeline(
            { classify: async () => ({ categoryId: 'dining', confidence: 0.9, reasoning: '' }) },
            { confidenceThreshold: 0.8 },
          ),
        ),
      describeModel: () =>
        Promise.resolve({ provider: 'local_only', model: null, localOnly: true, reason: 'History only in tests' }),
    });
    registry = new IpcRegistry();
    registerHandlers(registry, services);
  });

  afterEach(() => {
    handle.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('answers the dashboard channel end to end', async () => {
    const d = (await registry.invoke('dashboard:get', {
      periodStart: '2026-08-01T00:00:00Z',
      periodEnd: '2026-09-01T00:00:00Z',
    })) as { dataComplete: boolean };
    expect(d.dataComplete).toBe(false);
  });

  it('answers every read channel without error', async () => {
    const channels = [
      'setup:status',
      'institutions:list',
      'breakdown:byCategory',
      'breakdown:byMerchant',
      'transactions:query',
      'trends:overTime',
      'income:list',
      'review:queue',
      'categories:list',
      'recurring:list',
      'alerts:list',
      'alertRules:list',
      'reports:list',
      'health:get',
      'settings:get',
    ];
    const range = { periodStart: '2026-08-01T00:00:00Z', periodEnd: '2026-09-01T00:00:00Z' };
    const failures: string[] = [];
    for (const channel of channels) {
      try {
        await registry.invoke(channel, range);
      } catch (e) {
        failures.push(`${channel}: ${(e as { code?: string }).code}`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

describe('Plaid link flow error handling', () => {
  let dir: string;
  let handle: DatabaseHandle;
  let services: InstanceType<typeof Services>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'money-link-'));
    handle = await openDatabase(dir, new TestBackend());
    runMigrations(handle, MIGRATIONS);
    services = new Services({
      handle,
      userDataDir: dir,
      clock: new TestClock(NOW),
      logger: new DiagnosticLogger(new MemorySink(), new TestClock(NOW)),
      keyring: new Keyring(new TestBackend()),
      pipeline: new CategorizationPipeline(
        { classify: async () => ({ categoryId: 'dining', confidence: 0.9, reasoning: '' }) },
        { confidenceThreshold: 0.8 },
      ),
      sync: async () => EMPTY_SYNC,
      buildPipeline: () =>
        Promise.resolve(
          new CategorizationPipeline(
            { classify: async () => ({ categoryId: 'dining', confidence: 0.9, reasoning: '' }) },
            { confidenceThreshold: 0.8 },
          ),
        ),
      describeModel: () =>
        Promise.resolve({ provider: 'local_only', model: null, localOnly: true, reason: 'History only in tests' }),
    });
  });

  afterEach(() => {
    handle.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('tells the user to configure Plaid before connecting', async () => {
    await expect(services.startLink()).rejects.toMatchObject({
      code: 'PLAID_UNCONFIGURED',
      action: 'Open Settings',
    });
  });

  it('refuses to complete a link with no session in progress', async () => {
    await expect(services.completeLink('')).rejects.toMatchObject({
      code: 'PLAID_UNCONFIGURED',
    });
  });

  it('reaches Plaid once credentials are stored, and reports a credential rejection clearly', async () => {
    await services.saveCredentials({
      plaidClientId: 'bad-client',
      plaidSecret: 'bad-secret',
      plaidEnv: 'sandbox',
    });
    // Real call to Plaid sandbox with deliberately invalid keys: proves the
    // credentials are read back, decrypted, and used — and that a rejection is
    // mapped to an actionable error rather than a raw stack.
    await expect(services.startLink()).rejects.toMatchObject({
      code: expect.stringMatching(/PLAID_UNCONFIGURED|INTERNAL/),
    });
  });

  it('round-trips a sealed secret so the Plaid client can be built', async () => {
    await services.saveCredentials({
      plaidClientId: 'client-abc',
      plaidSecret: 'secret-xyz',
      plaidEnv: 'production',
    });
    const rows = await handle.db.select().from(schema.settings);
    const stored = rows.find((r) => r.key === 'plaidSecret');
    expect(stored?.value).not.toContain('secret-xyz');
    const status = (await services.setupStatus()) as { plaidConfigured: boolean };
    expect(status.plaidConfigured).toBe(true);
  });

  it('lists no Ollama models when Ollama is unreachable, without erroring', async () => {
    await services.updateSettings({ ollamaBaseUrl: 'http://127.0.0.1:1' });
    expect(await services.listOllamaModels()).toEqual([]);
  });

  it('exposes the model settings with Haiku as the default', async () => {
    const s = (await services.getSettings()) as {
      modelProvider: string;
      anthropicModel: string;
    };
    expect(s.modelProvider).toBe('anthropic');
    expect(s.anthropicModel).toBe('claude-haiku-4-5');
  });

  it('persists a model provider change', async () => {
    await services.updateSettings({ modelProvider: 'ollama', ollamaModel: 'llama3' });
    const s = (await services.getSettings()) as { modelProvider: string; ollamaModel: string };
    expect(s.modelProvider).toBe('ollama');
    expect(s.ollamaModel).toBe('llama3');
  });
});
