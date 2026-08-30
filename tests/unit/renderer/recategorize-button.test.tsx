// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { RecategorizeButton } from '@renderer/components/RecategorizeButton';
import { installMoneyBridge } from './setup';

afterEach(cleanup);

describe('the recategorize button', () => {
  it('defaults to only what is unresolved', async () => {
    const invoke = vi.fn(() => Promise.resolve({ message: 'done', changed: 3 }));
    Object.defineProperty(globalThis.window, 'money', {
      configurable: true,
      value: { invoke, on: () => () => {} },
    });
    render(<RecategorizeButton />);
    fireEvent.click(screen.getByText('Recategorize with AI'));
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
    fireEvent.change(screen.getByLabelText('What to recategorize'), {
      target: { value: 'all' },
    });
    fireEvent.click(screen.getByText('Recategorize with AI'));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('categorization:rerun', { scope: 'all' }),
    );
  });

  it('reports what it did', async () => {
    installMoneyBridge({
      'categorization:rerun': { message: 'Recategorized 37 of 40 unresolved transactions.' },
    });
    render(<RecategorizeButton />);
    fireEvent.click(screen.getByText('Recategorize with AI'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('37 of 40'));
  });

  it('reports a failure rather than looking like it did nothing', async () => {
    installMoneyBridge({});
    render(<RecategorizeButton />);
    fireEvent.click(screen.getByText('Recategorize with AI'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('No stub'));
  });

  it('disables itself while running', async () => {
    installMoneyBridge({ 'categorization:rerun': { message: 'done' } });
    render(<RecategorizeButton />);
    fireEvent.click(screen.getByText('Recategorize with AI'));
    expect(screen.getByText('Recategorizing…')).toBeDefined();
    await waitFor(() => screen.getByText('Recategorize with AI'));
  });

  it('tells the caller when it finishes, so the list can refresh', async () => {
    const onDone = vi.fn();
    installMoneyBridge({ 'categorization:rerun': { message: 'done' } });
    render(<RecategorizeButton onDone={onDone} />);
    fireEvent.click(screen.getByText('Recategorize with AI'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
