import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain } from 'electron';
import { join } from 'node:path';
import { assertEncryptionAvailable, EncryptionUnavailableError } from './secrets/availability';
import { ElectronSecretBackend } from './secrets/electron-backend';
import { Keyring } from './secrets/keyring';
import { openDatabase, type DatabaseHandle } from './db/client';
import { runMigrations } from './db/migrate';
import { defaultCategories, defaultAlertRules } from './db/seed-categories';
import { categories as categoriesTable } from './db/schema';
import { IpcRegistry } from './ipc/registry';
import { registerHandlers } from './ipc/handlers/index';
import { Services } from './services/index';
import { CategorizationPipeline } from './categorization/pipeline';
import { buildClassifier, DEFAULT_ANTHROPIC_MODEL, type ModelProvider } from './categorization/factory';
import { taxonomyPromptList } from './db/seed-categories';
import { SyncEngine, type SyncPage } from './sync/engine';
import { DrizzleSyncStore } from './sync/store';
import { createPlaidClient } from './plaid/client';
import { settings as settingsTable, institutions as institutionsTable, alertRules as alertRulesTable } from './db/schema';
import { eq } from 'drizzle-orm';
import { DiagnosticLogger } from './diagnostics/logger';
import { MemorySink } from './diagnostics/sink';
import { SystemClock } from '@shared/clock';

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
let syncNow: (() => Promise<void>) | null = null;
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

  const handle = await openDatabase(userDataDir, backend);
  databaseHandle = handle;
  runMigrations(handle);

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
  const logger = new DiagnosticLogger(new MemorySink(), clock);

  const readSetting = async (key: string): Promise<string | null> => {
    const rows = await handle.db.select().from(settingsTable).where(eq(settingsTable.key, key));
    return rows[0]?.value ?? null;
  };
  const readSecret = async (key: string): Promise<string | null> => {
    const value = await readSetting(key);
    if (!value) return null;
    return (await keyring.open(Buffer.from(value, 'base64'))).value;
  };

  // The categorizer is rebuilt from settings each time it is needed, so
  // switching provider or model in the UI takes effect without a restart.
  const buildPipeline = async (): Promise<CategorizationPipeline> => {
    const categories = await handle.db.select().from(categoriesTable);
    const built = buildClassifier({
      provider: ((await readSetting('modelProvider')) ?? 'anthropic') as ModelProvider,
      taxonomy: taxonomyPromptList(categories),
      anthropicApiKey: (await readSecret('anthropicApiKey')) ?? undefined,
      anthropicModel: (await readSetting('anthropicModel')) ?? DEFAULT_ANTHROPIC_MODEL,
      ollamaModel: (await readSetting('ollamaModel')) ?? undefined,
      ollamaBaseUrl: (await readSetting('ollamaBaseUrl')) ?? undefined,
    });
    const threshold = Number((await readSetting('confidenceThreshold')) ?? 0.8);
    return new CategorizationPipeline(
      built.classifier ?? { classify: () => Promise.reject(new Error(built.reason)) },
      { confidenceThreshold: threshold, localOnly: built.localOnly },
    );
  };

  const pipeline = await buildPipeline();

  /** Sync every connected institution. Called on launch, on a timer, and after linking. */
  const runSync = async (): Promise<void> => {
    const rows = await handle.db.select().from(institutionsTable);
    if (rows.length === 0) return;

    const clientId = await readSecret('plaidClientId');
    const secret = await readSecret('plaidSecret');
    if (!clientId || !secret) return;
    const client = createPlaidClient({
      clientId,
      secret,
      environment: (await readSetting('plaidEnv')) === 'production' ? 'production' : 'sandbox',
    });

    const store = new DrizzleSyncStore(handle, clock);
    const engine = new SyncEngine({ store, clock, pipeline: await buildPipeline() });

    const sources = await Promise.all(
      rows.map(async (inst) => ({
        institutionId: inst.id,
        cursor: inst.syncCursor,
        fetch: async (cursor: string | null) => {
          const accessToken = (await keyring.open(Buffer.from(inst.accessTokenEncrypted, 'base64'))).value;
          const response = await client.transactionsSync({
            access_token: accessToken,
            ...(cursor ? { cursor } : {}),
          });
          // Plaid's Transaction type carries more fields than ingestion reads;
          // the shape is structurally compatible with PlaidTransactionLike.
          return response.data as unknown as SyncPage;
        },
      })),
    );

    const result = await engine.run(sources);
    for (const failure of result.failures) {
      await store.markAttempted(failure.institutionId, clock.now().toISOString(), true);
    }

    // Rebuild the derived ledgers from what was just ingested. Without this the
    // recurring and income lists stay permanently empty.
    await services.refreshAnalysis();
    mainWindow?.webContents.send('sync:complete', { added: result.added, failures: result.failures.length });
  };

  const services = new Services({
    handle,
    userDataDir,
    clock,
    logger,
    keyring,
    pipeline,
    sync: () => runSync(),
  });

  syncNow = runSync;

  // Build the derived ledgers from whatever is already stored, so a database
  // imported before this pass existed is not left with empty lists.
  void services.refreshAnalysis().catch(() => {
    /* surfaced in the health view rather than blocking startup */
  });

  const registry = new IpcRegistry();
  registerHandlers(registry, services);
  for (const channel of registry.channels()) {
    ipcMain.handle(channel, async (_event, payload: unknown) => registry.invoke(channel, payload));
  }
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
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  app.whenReady().then(async () => {
    // Gate startup on encryption. Constitution VII: fail loudly rather than
    // writing an unencrypted financial database.
    try {
      await assertEncryptionAvailable(new ElectronSecretBackend());
    } catch (error) {
      if (error instanceof EncryptionUnavailableError) {
        dialog.showErrorBox('Money cannot start', error.message);
      }
      app.quit();
      return;
    }

    // Launch at login so background sync resumes without the user thinking
    // about it. The window stays hidden until asked for.
    // Compose the application. Everything below this point is real wiring:
    // without it the process runs but no IPC channel is answered.
    try {
      await bootstrap();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The local database could not be opened.';
      // A native dialog can be missed or dismissed; show the reason in a window
      // too, so the failure is never a silent blank screen.
      dialog.showErrorBox('Money could not start', message);
      const failureWindow = new BrowserWindow({ width: 620, height: 320, show: true });
      void failureWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          `<body style="background:#0d151c;color:#e8eaed;font:13px system-ui;padding:32px">
             <h1 style="font-size:16px;margin:0 0 12px">Money could not start</h1>
             <p style="color:#8b95a1;margin:0 0 16px">Your data has not been changed.</p>
             <pre style="white-space:pre-wrap;background:#161e26;padding:12px;border:1px solid #2a3441">${message.replace(/[<>&]/g, '')}</pre>
           </body>`,
        )}`,
      );
      return;
    }

    app.setLoginItemSettings({ openAtLogin: true });
    mainWindow = createWindow();
    tray = createTray();

    // Catch up on launch, then poll. A gap of minutes and a gap of weeks are
    // the same call (research.md R2, R6).
    void syncNow?.().catch(() => {
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
  }, () => {
    app.quit();
  });

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
