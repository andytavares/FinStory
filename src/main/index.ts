import { app, BrowserWindow, Tray, Menu, nativeImage, dialog } from 'electron';
import { join } from 'node:path';
import { assertEncryptionAvailable, EncryptionUnavailableError } from './secrets/availability';
import { ElectronSecretBackend } from './secrets/electron-backend';

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

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
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
  });

  // Deliberately NOT quitting on window-all-closed: the app stays resident so
  // background sync continues.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && isQuitting) app.quit();
  });
}
