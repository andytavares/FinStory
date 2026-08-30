import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain } from 'electron';
import { join } from 'node:path';
import { assertEncryptionAvailable, EncryptionUnavailableError } from './secrets/availability';
import { ElectronSecretBackend } from './secrets/electron-backend';
import { Keyring } from './secrets/keyring';
import { openDatabase, type DatabaseHandle } from './db/client';
import { runMigrations } from './db/migrate';
import { defaultCategories } from './db/seed-categories';
import { categories as categoriesTable } from './db/schema';
import { IpcRegistry } from './ipc/registry';
import { registerHandlers } from './ipc/handlers/index';
import { Services } from './services/index';
import { CategorizationPipeline } from './categorization/pipeline';
import type { ModelClassifier } from './categorization/pipeline';
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

  const clock = new SystemClock();
  const logger = new DiagnosticLogger(new MemorySink(), clock);

  // Until Plaid credentials are configured, categorization has no model stage.
  // Local-only is the correct behaviour then, not an error (FR-061).
  const unavailableModel: ModelClassifier = {
    classify: () => Promise.reject(new Error('Categorization is not configured')),
  };
  const pipeline = new CategorizationPipeline(unavailableModel, {
    confidenceThreshold: 0.8,
    localOnly: true,
  });

  const services = new Services({
    handle,
    userDataDir,
    clock,
    logger,
    keyring,
    pipeline,
    sync: async () => {
      // Wired once Plaid credentials exist; see docs/plaid-setup.md.
    },
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
      dialog.showErrorBox(
        'Money could not start',
        error instanceof Error ? error.message : 'The local database could not be opened.',
      );
      app.quit();
      return;
    }

    app.setLoginItemSettings({ openAtLogin: true });
    mainWindow = createWindow();
    tray = createTray();

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
    databaseHandle?.close();
  });

  // Deliberately NOT quitting on window-all-closed: the app stays resident so
  // background sync continues.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && isQuitting) app.quit();
  });
}
