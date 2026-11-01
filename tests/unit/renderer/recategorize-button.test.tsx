// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { RecategorizeButton } from '@renderer/components/RecategorizeButton';
import { installMoneyBridge, emitToRenderer } from './setup';

afterEach(cleanup);

describe('the recategorize button', () => {
  it('defaults to unresolved only, with Unresolved only pressed', async () => {
    const invoke = vi.fn(() => Promise.resolve({ message: 'done', changed: 3 }));
    Object.defineProperty(globalThis.window, 'money', {
      configurable: true,
      value: { invoke, on: () => () => {} },
    });
    render(<RecategorizeButton />);
    expect(screen.getByRole('button', { name: 'Unresolved only' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('categorization:rerun', { scope: 'unresolved' }),
    );
  });

  it('can be pointed at everything except the user\'s own corrections', async () => {
    const invoke = vi.fn(() => Promise.resolve({ message: 'done', changed: 9 }));
    Object.defineProperty(globalThis.window, 'money', {
      configurable: true,
      value: { invoke, on: () => () => {} },
    });
    render(<RecategorizeButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Everything' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('categorization:rerun', { scope: 'all' }),
    );
  });

  it('reports what it did', async () => {
    installMoneyBridge({
      'categorization:rerun': { message: 'Recategorized 37 of 40 unresolved transactions.' },
    });
    render(<RecategorizeButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('37 of 40'));
  });

  it('reports a failure rather than looking like it did nothing', async () => {
    installMoneyBridge({});
    render(<RecategorizeButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('No stub'));
  });

  it('disables itself while running', async () => {
    installMoneyBridge({ 'categorization:rerun': { message: 'done' } });
    render(<RecategorizeButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(screen.getByText('Sorting…')).toBeDefined();
    await waitFor(() => screen.getByRole('button', { name: 'Run' }));
  });

  it('tells the caller when it finishes, so the list can refresh', async () => {
    const onDone = vi.fn();
    installMoneyBridge({ 'categorization:rerun': { message: 'done' } });
    render(<RecategorizeButton onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});

describe('progress and stopping', () => {
  it('shows a progress bar while a run is in flight', async () => {
    installMoneyBridge({ 'categorization:rerun': { message: 'done' } });
    render(<RecategorizeButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    act(() => {
      emitToRenderer('categorization:progress', {
        processed: 12,
        total: 60,
        changed: 9,
        done: false,
      });
    });
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('20');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(screen.getByText(/12 of 60 · 9 recategorized/)).toBeDefined();
    await waitFor(() => screen.getByRole('button', { name: 'Run' }));
  });

  it('offers Stop only while running', async () => {
    installMoneyBridge({ 'categorization:rerun': { message: 'done' } });
    render(<RecategorizeButton />);
    expect(screen.queryByText('Stop')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(screen.getByText('Stop')).toBeDefined();
    await waitFor(() => expect(screen.queryByText('Stop')).toBeNull());
  });

  it('asks the main process to cancel', async () => {
    const invoke = vi.fn(() => Promise.resolve({ message: 'stopped' }));
    Object.defineProperty(globalThis.window, 'money', {
      configurable: true,
      value: { invoke, on: () => () => {} },
    });
    render(<RecategorizeButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    fireEvent.click(screen.getByText('Stop'));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('categorization:cancel', undefined));
  });

  it('says it is finishing the transaction in flight', async () => {
    installMoneyBridge({
      'categorization:rerun': { message: 'done' },
      'categorization:cancel': { ok: true },
    });
    render(<RecategorizeButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    act(() => {
      emitToRenderer('categorization:progress', {
        processed: 3,
        total: 60,
        changed: 2,
        done: false,
      });
    });
    fireEvent.click(screen.getByText('Stop'));
    expect(screen.getByText(/finishing the one in flight/)).toBeDefined();
    await waitFor(() => screen.getByRole('button', { name: 'Run' }));
  });

  it('clears the bar when the run reports done', async () => {
    installMoneyBridge({ 'categorization:rerun': { message: 'done' } });
    render(<RecategorizeButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    act(() => {
      emitToRenderer('categorization:progress', { processed: 5, total: 60, changed: 5, done: false });
    });
    expect(screen.getByRole('progressbar')).toBeDefined();
    act(() => {
      emitToRenderer('categorization:progress', { processed: 60, total: 60, changed: 55, done: true });
    });
    expect(screen.queryByRole('progressbar')).toBeNull();
    await waitFor(() => screen.getByRole('button', { name: 'Run' }));
  });

  it('hides the scope picker while running, since it cannot change mid-run', async () => {
    installMoneyBridge({ 'categorization:rerun': { message: 'done' } });
    render(<RecategorizeButton />);
    expect(screen.getByRole('group', { name: 'What to recategorize' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(screen.queryByRole('group', { name: 'What to recategorize' })).toBeNull();
    await waitFor(() => screen.getByRole('group', { name: 'What to recategorize' }));
  });
})
