const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** The part of electron-updater's `autoUpdater` used here, so tests can fake it. */
export interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
  on(event: 'update-downloaded', listener: (info: { version: string }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

interface StartUpdatesOptions {
  updater: Updater;
  send: (channel: string, payload: unknown) => void;
  intervalMs?: number;
  /** Wraps each check, e.g. to record it as background usage. */
  track?: ((run: () => Promise<unknown>) => Promise<unknown>) | undefined;
}

/** Check for updates now and every 6 hours; tell the renderer once one is downloaded. */
export function startUpdates(options: StartUpdatesOptions): () => void {
  const {
    updater,
    send,
    intervalMs = CHECK_INTERVAL_MS,
    track = (run: () => Promise<unknown>) => run(),
  } = options;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('update-downloaded', ({ version }) => send('update:ready', { version }));
  // A failed check (offline, no release yet) is retried at the next interval.
  updater.on('error', () => {});
  const check = (): void => void track(() => updater.checkForUpdates()).catch(() => {});
  check();
  const timer = setInterval(check, intervalMs);
  return () => clearInterval(timer);
}

/** `markQuitting` must lift the tray's close-to-hide guard, or the app never quits. */
export function installUpdate(updater: Updater, markQuitting: () => void): void {
  markQuitting();
  updater.quitAndInstall();
}
