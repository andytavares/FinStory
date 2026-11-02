import { recordSyncAttempt } from '@main/sync/record-attempt';
import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain } from 'electron';
import { join } from 'node:path';
import { assertEncryptionAvailable, EncryptionUnavailableError } from './secrets/availability';
import { ElectronSecretBackend } from './secrets/electron-backend';
import { Keyring } from './secrets/keyring';
import {
  accessTokenAccount,
  CREDENTIAL_ACCOUNTS,
  KeychainSecretStore,
  keychainService,
  type CredentialKey,
} from './secrets/secret-store';
import { migrateSecretsToKeychain } from './secrets/migrate-to-keychain';
import { openDatabase, type DatabaseHandle } from './db/client';
import { runMigrations } from './db/migrate';
import { defaultCategories, defaultAlertRules } from './db/seed-categories';
import { categories as categoriesTable } from './db/schema';
import { selectPlaidInstitutions } from './import/institutions';
import { IpcRegistry } from './ipc/registry';
import { registerHandlers } from './ipc/handlers/index';
import { Services, type ModelDescription } from './services/index';
import { CategorizationPipeline } from './categorization/pipeline';
import { loadMerchantProfiles } from './categorization/profiles';
import {
  buildClassifier,
  DEFAULT_ANTHROPIC_MODEL,
  type ModelProvider,
} from './categorization/factory';
import { taxonomyPromptList } from './db/seed-categories';
import { EMPTY_SYNC, type SyncOutcome } from '@main/sync/outcome';
import { SyncEngine, type SyncPage } from './sync/engine';
import { DrizzleSyncStore } from './sync/store';
import { createPlaidClient, plaidError } from './plaid/client';
import {
  settings as settingsTable,
  alertRules as alertRulesTable,
  merchantProfiles as merchantProfilesTable,
} from './db/schema';
import { eq } from 'drizzle-orm';
import electronUpdater from 'electron-updater';
import { startUpdates, installUpdate } from './updates';
import { DiagnosticLogger } from './diagnostics/logger';
import { DatabaseSink } from './diagnostics/sink';
import { SystemClock } from '@shared/clock';
import type { UsageRecorder } from './usage/recorder';

/**
 * Application lifecycle.
 *
 * Tray-resident with launch-at-login so the app polls through the day without
 * being "open" in any way the user notices (research.md R6). It makes no claim
 * of continuous coverage: when the machine sleeps, nothing runs, and
 * correctness is defined by complete catch-up on wake rather than uptime.
 */

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let databaseHandle: DatabaseHandle | null = null;
let syncNow: (() => Promise<SyncOutcome>) | null = null;
let launchCatchUp: (() => Promise<SyncOutcome>) | null = null;
let trackUpdateCheck: ((run: () => Promise<unknown>) => Promise<unknown>) | undefined;
let syncTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Assemble the application.
 *
 * Opens the encrypted database, applies migrations, seeds the default taxonomy
 * on first run, builds the service layer, and binds every IPC channel through
 * the registry so payloads are validated on this side of the boundary.
 */
async function bootstrap(): Promise<void> {
  const userDataDir = app.getPath('userData');
  const backend = new ElectronSecretBackend();
  const keyring = new Keyring(backend);

  const secretStore = new KeychainSecretStore(keychainService(app.isPackaged, userDataDir));

  const handle = await openDatabase(userDataDir, secretStore, keyring);
  databaseHandle = handle;
  runMigrations(handle);
  // Failures keep their original and retry next launch, so they never block startup.
  await migrateSecretsToKeychain({ db: handle.db, store: secretStore, keyring, userDataDir });

  // Seed once: the app must be usable with no configuration (FR-078).
  const existing = await handle.db.select().from(categoriesTable);
  if (existing.length === 0) {
    await handle.db.insert(categoriesTable).values(defaultCategories());
  }
  // Alert rules must exist before any account is connected, or the Alerts
  // screen is empty and there is nothing to configure.
  const existingRules = await handle.db.select().from(alertRulesTable);
  if (existingRules.length === 0) {
    await handle.db.insert(alertRulesTable).values(defaultAlertRules());
  }

  const clock = new SystemClock();
  const logger = new DiagnosticLogger(new DatabaseSink(handle.db), clock);

  const readSetting = async (key: string): Promise<string | null> => {
    const rows = await handle.db.select().from(settingsTable).where(eq(settingsTable.key, key));
    return rows[0]?.value ?? null;
  };
  const readSecret = (key: CredentialKey): Promise<string | null> =>
    secretStore.get(CREDENTIAL_ACCOUNTS[key]);

  // The categorizer is rebuilt from settings each time it is needed, so
  // switching provider or model in the UI takes effect without a restart.
  const buildPipeline = async (): Promise<CategorizationPipeline> => {
    const categories = await handle.db.select().from(categoriesTable);
    const built = buildClassifier({
      provider: ((await readSetting('modelProvider')) ?? 'anthropic') as ModelProvider,
      taxonomy: taxonomyPromptList(categories),
      anthropicApiKey: (await readSecret('anthropicApiKey')) ?? undefined,
      anthropicModel: (await readSetting('anthropicModel')) ?? DEFAULT_ANTHROPIC_MODEL,
      anthropicWorkspaceId: (await readSetting('anthropicWorkspaceId')) ?? undefined,
      ollamaModel: (await readSetting('ollamaModel')) ?? undefined,
      ollamaBaseUrl: (await readSetting('ollamaBaseUrl')) ?? undefined,
    });
    const threshold = Number((await readSetting('confidenceThreshold')) ?? 0.8);
    const pipeline = new CategorizationPipeline(
      built.classifier ?? { classify: () => Promise.reject(new Error(built.reason)) },
      {
        confidenceThreshold: threshold,
        localOnly: built.localOnly,
        // Read fresh each build: the user can delete categories at any time.
        validCategoryIds: new Set(
          categories.filter((c) => c.mergedIntoId === null).map((c) => c.id),
        ),
      },
    );
    loadMerchantProfiles(await handle.db.select().from(merchantProfilesTable), pipeline);
    return pipeline;
  };

  const pipeline = await buildPipeline();

  /** What the categorizer is currently configured to do, for the Settings test. */
  const describeModel = async (): Promise<ModelDescription> => {
    const provider = ((await readSetting('modelProvider')) ?? 'anthropic') as ModelProvider;
    const built = buildClassifier({
      provider,
      taxonomy: '',
      anthropicApiKey: (await readSecret('anthropicApiKey')) ?? undefined,
      anthropicModel: (await readSetting('anthropicModel')) ?? DEFAULT_ANTHROPIC_MODEL,
      anthropicWorkspaceId: (await readSetting('anthropicWorkspaceId')) ?? undefined,
      ollamaModel: (await readSetting('ollamaModel')) ?? undefined,
      ollamaBaseUrl: (await readSetting('ollamaBaseUrl')) ?? undefined,
    });
    const model =
      provider === 'ollama'
        ? ((await readSetting('ollamaModel')) ?? null)
        : ((await readSetting('anthropicModel')) ?? DEFAULT_ANTHROPIC_MODEL);
    return { provider, model, localOnly: built.localOnly, reason: built.reason };
  };

  /** The Plaid client, or null while the credentials are missing. */
  const plaidClient = async (): Promise<ReturnType<typeof createPlaidClient> | null> => {
    const clientId = await readSecret('plaidClientId');
    const secret = await readSecret('plaidSecret');
    if (!clientId || !secret) return null;
    const environment = (await readSetting('plaidEnv')) === 'production' ? 'production' : 'sandbox';
    return createPlaidClient({ clientId, secret, environment });
  };

  type PlaidInstitution = Awaited<ReturnType<typeof selectPlaidInstitutions>>[number];
  const plaidSource = (inst: PlaidInstitution, client: ReturnType<typeof createPlaidClient>) => ({
    institutionId: inst.id,
    cursor: inst.syncCursor,
    fetch: async (cursor: string | null) => {
      const accessToken = await secretStore.get(accessTokenAccount(inst.id));
      if (!accessToken)
        throw new Error(`No access token in the Keychain for ${inst.institutionName}`);
      const response = await client
        .transactionsSync({ access_token: accessToken, ...(cursor ? { cursor } : {}) })
        .catch((error: unknown) => {
          throw plaidError(error);
        });
      // Plaid's Transaction type carries more fields than ingestion reads;
      // the shape is structurally compatible with PlaidTransactionLike.
      return response.data as unknown as SyncPage;
    },
  });

  /** Sync every connected institution. Called on launch, on a timer, and after linking. */
  const syncAll = async (): Promise<SyncOutcome> => {
    const rows = await selectPlaidInstitutions(handle.db);
    if (rows.length === 0) return { ...EMPTY_SYNC, blocked: 'no_institutions' };

    const client = await plaidClient();
    if (!client) return { ...EMPTY_SYNC, blocked: 'no_credentials' };

    const store = new DrizzleSyncStore(handle, clock);
    const syncPipeline = await buildPipeline();
    const engine = new SyncEngine({
      store,
      clock,
      pipeline: syncPipeline,
      trackAlerts: (run) => services.usage.track('job:alerts', 'background', run),
    });

    const sources = rows.map((inst) => plaidSource(inst, client));

    const result = await engine.run(sources);
    for (const failure of result.failures) {
      await store.markAttempted(failure.institutionId, clock.now().toISOString(), true);
    }

    // Rebuild the derived ledgers from what was just ingested. Without this the
    // recurring and income lists stay permanently empty.
    await refreshAnalysisJob();

    const outcome = syncOutcome(result, rows.length, syncPipeline);
    mainWindow?.webContents.send('sync:complete', outcome);
    return outcome;
  };

  const runSync = (): Promise<SyncOutcome> =>
    services.usage.track('job:sync', 'background', () => recordSyncAttempt(logger, syncAll));
  const refreshAnalysisJob = (): Promise<unknown> =>
    services.usage.track('job:analysis', 'background', () => services.refreshAnalysis());

  const services = new Services({
    handle,
    userDataDir,
    clock,
    logger,
    store: secretStore,
    pipeline,
    buildPipeline,
    describeModel,
    sync: () => runSync(),
    emit: (channel, payload) => mainWindow?.webContents.send(channel, payload),
    appVersion: app.getVersion(),
    printToPdf: async () => {
      if (!mainWindow) throw new Error('The window is not open');
      return mainWindow.webContents.printToPDF({ printBackground: true });
    },
  });

  syncNow = runSync;
  void services.usage.prune(
    clock.now(),
    ((await readSetting('usageRetention')) ?? '365') as '365' | 'forever',
  );
  launchCatchUp = () => services.usage.track('job:catch-up', 'background', runSync);

  // Build the derived ledgers from whatever is already stored, so a database
  // imported before this pass existed is not left with empty lists.
  void refreshAnalysisJob().catch(() => {
    /* surfaced in the health view rather than blocking startup */
  });

  const registry = new IpcRegistry();
  registerHandlers(registry, services);
  // usage:* channels are not tracked, or reading the usage screen would fill it.
  const trackIpc = <T>(channel: string, run: () => Promise<T>): Promise<T> =>
    channel.startsWith('usage:') ? run() : services.usage.track(channel, 'action', run);
  for (const channel of registry.channels()) {
    ipcMain.handle(channel, (_event, payload: unknown) =>
      trackIpc(channel, () => registry.invoke(channel, payload)),
    );
  }
  // Both channels close the database and replace its files; only a fresh start reopens one.
  for (const channel of ['data:deleteAll', 'data:import'] as const) {
    relaunchAfter(registry, channel, services.usage);
  }
  ipcMain.handle('app:version', () => trackIpc('app:version', async () => app.getVersion()));
  ipcMain.handle('update:install', () =>
    trackIpc('update:install', async () =>
      installUpdate(electronUpdater.autoUpdater, () => {
        isQuitting = true;
      }),
    ),
  );
  trackUpdateCheck = (run) => services.usage.track('job:update-check', 'background', run);
}

function relaunchAfter(registry: IpcRegistry, channel: string, usage: UsageRecorder): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (_event, payload: unknown) => {
    // Recorded first: the database is closed by the time the call returns.
    await usage.record({ feature: channel, kind: 'action', outcome: 'success' });
    const result = await registry.invoke(channel, payload);
    if ((result as { ok?: boolean }).ok) {
      app.relaunch();
      app.exit(0);
    }
    return result;
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      // The bundle is ESM (package.json "type": "module"), so electron-vite
      // emits index.mjs. Electron loads an ESM preload only with sandbox off,
      // which is why sandbox is false below.
      preload: join(__dirname, '../preload/index.mjs'),
      // The configuration in which FR-047 is enforceable rather than merely
      // intended. Do not relax either of these.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.on('ready-to-show', () => window.show());

  // Closing the window leaves the app resident in the tray so background sync
  // continues; quitting is explicit.
  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return window;
}

let isQuitting = false;

function createTray(): Tray {
  const t = new Tray(nativeImage.createEmpty());
  t.setToolTip('Money');
  t.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open Money',
        click: () => {
          mainWindow?.show();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  return t;
}

// One instance only: two processes writing one SQLite database is a corruption
// risk, and two schedulers would double every alert.
function syncOutcome(
  result: Awaited<ReturnType<SyncEngine['run']>>,
  institutionCount: number,
  pipeline: CategorizationPipeline,
): SyncOutcome {
  return {
    added: result.added,
    updated: result.updated,
    removed: result.removed,
    skipped: result.skipped,
    institutionCount,
    failures: result.failures.map((f) => f.message),
    modelFailures: pipeline.modelFailures,
    modelError: pipeline.lastModelError,
    blocked: null,
  };
}

/** Gate startup on encryption (constitution VII): fail loudly rather than write an unencrypted database. */
async function encryptionAvailable(): Promise<boolean> {
  try {
    await assertEncryptionAvailable(new ElectronSecretBackend());
    return true;
  } catch (error) {
    if (error instanceof EncryptionUnavailableError) {
      dialog.showErrorBox('Money cannot start', error.message);
    }
    app.quit();
    return false;
  }
}

/** A native dialog can be missed or dismissed, so also show the reason in a window: never a silent blank screen. */
const HTML_UNSAFE = /[<>&]/g;

function failurePageHtml(message: string): string {
  const safe = message.replace(HTML_UNSAFE, '');
  return [
    '<body style="background:#0d151c;color:#e8eaed;font:13px system-ui;padding:32px">',
    '<h1 style="font-size:16px;margin:0 0 12px">Money could not start</h1>',
    '<p style="color:#8b95a1;margin:0 0 16px">Your data has not been changed.</p>',
    `<pre style="white-space:pre-wrap;background:#161e26;padding:12px;border:1px solid #2a3441">${safe}</pre>`,
    '</body>',
  ].join('\n');
}

function showStartupFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : 'The local database could not be opened.';
  dialog.showErrorBox('Money could not start', message);
  const failureWindow = new BrowserWindow({ width: 620, height: 320, show: true });
  void failureWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(failurePageHtml(message))}`);
}

// Dev builds own the default folder (`money`) with Keychain items under a dev service; sharing it hands the installed app a database it has no key for.
if (app.isPackaged) app.setPath('userData', join(app.getPath('appData'), 'com.atavares.money'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  app.whenReady().then(
    async () => {
      if (!(await encryptionAvailable())) return;
      // Everything below is real wiring: without it no IPC channel is answered.
      try {
        await bootstrap();
      } catch (error) {
        showStartupFailure(error);
        return;
      }

      // Launch at login so background sync resumes; the window stays hidden until asked for.
      app.setLoginItemSettings({ openAtLogin: true });
      mainWindow = createWindow();
      tray = createTray();

      if (app.isPackaged) {
        startUpdates({
          updater: electronUpdater.autoUpdater,
          send: (channel, payload) => mainWindow?.webContents.send(channel, payload),
          track: trackUpdateCheck,
        });
      }

      // Catch up on launch, then poll. A gap of minutes and a gap of weeks are
      // the same call (research.md R2, R6).
      void launchCatchUp?.().catch(() => {
        /* surfaced in the health view rather than blocking startup */
      });
      syncTimer = setInterval(
        () => {
          void syncNow?.().catch(() => {});
        },
        60 * 60 * 1000,
      );

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
        else mainWindow?.show();
      });
    },
    () => {
      app.quit();
    },
  );

  app.on('before-quit', () => {
    isQuitting = true;
    tray?.destroy();
    if (syncTimer) clearInterval(syncTimer);
    databaseHandle?.close();
  });

  // Deliberately NOT quitting on window-all-closed: the app stays resident so
  // background sync continues.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && isQuitting) app.quit();
  });
}
