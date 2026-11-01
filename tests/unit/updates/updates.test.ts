import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { startUpdates, installUpdate, type Updater } from '@main/updates';

const SIX_HOURS = 6 * 60 * 60 * 1000;

function fakeUpdater() {
  const updater = Object.assign(new EventEmitter(), {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(() => Promise.resolve(null)),
    quitAndInstall: vi.fn(),
  });
  return updater as typeof updater & Updater;
}

describe('startUpdates', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('downloads automatically, installs on quit, and checks at start and every 6 hours', () => {
    const updater = fakeUpdater();
    startUpdates({ updater, send: vi.fn() });
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(SIX_HOURS - 1);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('tells the renderer when an update is downloaded', () => {
    const updater = fakeUpdater();
    const send = vi.fn();
    startUpdates({ updater, send });
    updater.emit('update-downloaded', { version: '1.2.3' });
    expect(send).toHaveBeenCalledWith('update:ready', { version: '1.2.3' });
  });

  it('survives a failed check and an updater error', async () => {
    const updater = fakeUpdater();
    updater.checkForUpdates.mockRejectedValue(new Error('offline'));
    startUpdates({ updater, send: vi.fn() });
    expect(() => updater.emit('error', new Error('boom'))).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
  });
});

describe('startUpdates usage', () => {
  it('reports every check, at start and on the interval, so Usage can show update checks', () => {
    vi.useFakeTimers();
    const updater = fakeUpdater();
    const track = vi.fn((run: () => Promise<unknown>) => run());
    const stop = startUpdates({ updater, send: vi.fn(), track });
    vi.advanceTimersByTime(6 * 60 * 60 * 1000);
    expect(track).toHaveBeenCalledTimes(2);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    stop();
    vi.useRealTimers();
  });
});

describe('installUpdate', () => {
  it('sets the quitting flag before it quits and installs', () => {
    const updater = fakeUpdater();
    const order: string[] = [];
    updater.quitAndInstall.mockImplementation(() => order.push('quitAndInstall'));
    installUpdate(updater, () => order.push('markQuitting'));
    expect(order).toEqual(['markQuitting', 'quitAndInstall']);
  });
});
