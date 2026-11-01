// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { Setup } from '@renderer/views/Setup';
import type { SetupStatus } from '@shared/types';

afterEach(cleanup);

const STATUS: SetupStatus = {
  plaidConfigured: false,
  plaidClientIdConfigured: false,
  plaidSecretConfigured: false,
  plaidEnv: 'sandbox',
  categorizationConfigured: false,
  accountCount: 0,
  encryptionAvailable: true,
};

function bridge(responses: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const invoke = vi.fn((channel: string) =>
    channel in responses ? Promise.resolve(responses[channel]) : Promise.reject(new Error(channel)),
  );
  Object.defineProperty(globalThis.window, 'money', {
    configurable: true,
    value: { invoke, on: () => () => {} },
  });
  return invoke;
}

describe('Setup (two-panel flow)', () => {
  it('shows the four steps and the headline', () => {
    bridge({});
    render(<Setup status={STATUS} onComplete={() => {}} />);
    expect(screen.getByText(/Never type a transaction again/)).toBeDefined();
    for (const step of ['Connect your bank', 'Choose how to sort transactions', 'Bring in history (optional)', 'Done'])
      expect(screen.getByText(step)).toBeDefined();
  });

  it('saves credentials and finishes from step 1 in one click', async () => {
    const invoke = bridge({ 'setup:saveCredentials': {} });
    const onComplete = vi.fn();
    render(<Setup status={STATUS} onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText('Client ID'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText('Secret'), { target: { value: 'xyz' } });
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/ }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith('setup:saveCredentials', expect.objectContaining({ plaidClientId: 'abc' }));
  });

  it('steps through sorting and history to Done', async () => {
    bridge({
      'setup:detectOllama': { running: true, version: '0.5', models: ['llama3.1:8b', 'qwen2.5'] },
    });
    render(<Setup status={STATUS} onComplete={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => screen.getByText('Connected'));
    expect(screen.getByRole('combobox', { name: 'Model' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText(/Available after setup in Import/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(screen.getByRole('button', { name: /Save and finish/ })).toBeDefined();
  });

  it('shows Not running when Ollama is absent', async () => {
    bridge({ 'setup:detectOllama': { running: false, models: [] } });
    render(<Setup status={STATUS} onComplete={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => screen.getByText('Not running'));
  });

  it('tests the chosen model and shows the answer', async () => {
    const invoke = bridge({
      'setup:detectOllama': { running: true, models: ['llama3.1:8b'] },
      'settings:update': {},
      'model:test': { message: 'Sorted 3 of 3 sample charges' },
    });
    render(<Setup status={STATUS} onComplete={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => screen.getByText('Connected'));
    fireEvent.click(screen.getByRole('button', { name: 'Test with 3 sample charges' }));
    await waitFor(() => screen.getByText('Sorted 3 of 3 sample charges'));
    expect(invoke).toHaveBeenCalledWith('settings:update', { modelProvider: 'ollama', ollamaModel: 'llama3.1:8b' });
  });
});
