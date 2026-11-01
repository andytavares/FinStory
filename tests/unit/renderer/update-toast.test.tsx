// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { UpdateToast } from '@renderer/components/UpdateToast';
import { installMoneyBridge, emitToRenderer } from './setup';

afterEach(cleanup);

describe('UpdateToast', () => {
  it('is hidden until an update is ready, then shows the version', () => {
    installMoneyBridge({});
    render(<UpdateToast />);
    expect(screen.queryByText(/is ready/)).toBeNull();
    act(() => emitToRenderer('update:ready', { version: '1.2.3' }));
    expect(screen.getByText('Money 1.2.3 is ready')).toBeTruthy();
  });

  it('hides on Later', () => {
    installMoneyBridge({});
    render(<UpdateToast />);
    act(() => emitToRenderer('update:ready', { version: '1.2.3' }));
    fireEvent.click(screen.getByText('Later'));
    expect(screen.queryByText(/is ready/)).toBeNull();
  });

  it('asks the main process to install on Restart now', () => {
    installMoneyBridge({});
    const invoke = vi.fn(() => Promise.resolve());
    (window.money as unknown as { invoke: unknown }).invoke = invoke;
    render(<UpdateToast />);
    act(() => emitToRenderer('update:ready', { version: '1.2.3' }));
    fireEvent.click(screen.getByText('Restart now'));
    expect(invoke).toHaveBeenCalledWith('update:install', undefined);
  });
});
