// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Settings } from '@renderer/views/Settings';
import { installMoneyBridge } from './setup';

afterEach(cleanup);

const BASE = {
  'settings:get': {
    modelProvider: 'anthropic',
    anthropicModel: 'claude-haiku-4-5',
    anthropicWorkspaceId: '',
    ollamaModel: '',
    ollamaBaseUrl: '',
    confidenceThreshold: 0.8,
    pollIntervalMinutes: 60,
  },
  'setup:status': { hasCredentials: true, hasInstitutions: true },
  'models:listOllama': [],
};

/**
 * Categorization degrades to local heuristics on any model error, so without
 * this check a broken key is indistinguishable from a working one.
 */
describe('the model check reports the real answer', () => {
  it('shows what the model replied when it works', async () => {
    installMoneyBridge({ ...BASE, 'model:test': { ok: true, message: 'claude-haiku-4-5 answered: dining' } });
    render(<Settings />);
    await waitFor(() => screen.getByText('Test the model'));
    fireEvent.click(screen.getByText('Test the model'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('answered: dining'));
  });

  it('shows the raw API error when it does not', async () => {
    installMoneyBridge({ ...BASE, 'model:test': { ok: false, message: '401 invalid x-api-key' } });
    render(<Settings />);
    await waitFor(() => screen.getByText('Test the model'));
    fireEvent.click(screen.getByText('Test the model'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('401 invalid x-api-key'));
  });

  it('reports the outcome of recategorizing what the model never saw', async () => {
    installMoneyBridge({
      ...BASE,
      'categorization:rerun': { ok: true, message: 'Recategorized 37 of 40 unresolved transactions.' },
    });
    render(<Settings />);
    await waitFor(() => screen.getByText('Recategorize with AI'));
    fireEvent.click(screen.getByText('Recategorize with AI'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('37 of 40'));
  });

  it('surfaces a thrown failure from the check itself', async () => {
    installMoneyBridge(BASE);
    render(<Settings />);
    await waitFor(() => screen.getByText('Test the model'));
    fireEvent.click(screen.getByText('Test the model'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('No stub'));
  });

  it('disables the test button while it is running', async () => {
    installMoneyBridge({ ...BASE, 'model:test': { ok: true, message: 'ok' } });
    render(<Settings />);
    await waitFor(() => screen.getByText('Test the model'));
    fireEvent.click(screen.getByText('Test the model'));
    expect(screen.getByText('Checking…')).toBeDefined();
    await waitFor(() => screen.getByText('Test the model'));
  });
});

describe('the workspace id field', () => {
  it('is offered for Claude, because identity-linked keys require it', async () => {
    installMoneyBridge(BASE);
    render(<Settings />);
    await waitFor(() => expect(screen.getByLabelText('Anthropic workspace ID')).toBeDefined());
  });

  it('saves what is typed, trimmed', async () => {
    const invoke = vi.fn((channel: string) =>
      channel === 'settings:get'
        ? Promise.resolve(BASE['settings:get'])
        : Promise.resolve(BASE['setup:status']),
    );
    Object.defineProperty(globalThis.window, 'money', {
      configurable: true,
      value: { invoke, on: () => () => {} },
    });
    render(<Settings />);
    await waitFor(() => screen.getByLabelText('Anthropic workspace ID'));
    fireEvent.change(screen.getByLabelText('Anthropic workspace ID'), {
      target: { value: '  wrkspc_42  ' },
    });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('settings:update', { anthropicWorkspaceId: 'wrkspc_42' }),
    );
  });

  it('is hidden when categorization runs locally', async () => {
    installMoneyBridge({
      ...BASE,
      'settings:get': { ...BASE['settings:get'], modelProvider: 'local_only' },
    });
    render(<Settings />);
    await waitFor(() => screen.getByText('Test the model'));
    expect(screen.queryByLabelText('Anthropic workspace ID')).toBeNull();
  });
})
