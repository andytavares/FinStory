// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Credentials } from '@renderer/components/Credentials';
import { installMoneyBridge } from './setup';
import type { SetupStatus } from '@shared/types';

afterEach(cleanup);

const STATUS: SetupStatus = {
  plaidConfigured: true,
  plaidClientIdConfigured: true,
  plaidSecretConfigured: true,
  plaidEnv: 'sandbox',
  categorizationConfigured: false,
  accountCount: 2,
  encryptionAvailable: true,
};

function bridge(): ReturnType<typeof vi.fn> {
  const invoke = vi.fn(() => Promise.resolve({ message: 'Saved.' }));
  Object.defineProperty(globalThis.window, 'money', {
    configurable: true,
    value: { invoke, on: () => () => {} },
  });
  return invoke;
}

describe('changing a credential after setup', () => {
  it('says which credentials are set without revealing them', () => {
    installMoneyBridge({});
    render(<Credentials status={STATUS} onSaved={() => {}} />);
    expect(screen.getAllByText('Set')).toHaveLength(2);
    expect(screen.getByText('Not set')).toBeDefined();
  });

  it('masks what is typed', () => {
    installMoneyBridge({});
    render(<Credentials status={STATUS} onSaved={() => {}} />);
    expect((screen.getByLabelText('Anthropic API key') as HTMLInputElement).type).toBe('password');
  });

  it('sends only the field that changed', async () => {
    const invoke = bridge();
    render(<Credentials status={STATUS} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText('Anthropic API key'), {
      target: { value: 'sk-ant-new' },
    });
    fireEvent.click(screen.getAllByText('Save')[2]!);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('credentials:update', { anthropicApiKey: 'sk-ant-new' }),
    );
  });

  it('will not save an empty field by accident', () => {
    installMoneyBridge({});
    render(<Credentials status={STATUS} onSaved={() => {}} />);
    expect((screen.getAllByText('Save')[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('removes a credential deliberately', async () => {
    const invoke = bridge();
    render(<Credentials status={STATUS} onSaved={() => {}} />);
    fireEvent.click(screen.getByLabelText('Remove Plaid secret'));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('credentials:update', { plaidSecret: '' }),
    );
  });

  it('offers no Remove for a credential that is not set', () => {
    installMoneyBridge({});
    render(<Credentials status={STATUS} onSaved={() => {}} />);
    expect(screen.queryByLabelText('Remove Anthropic API key')).toBeNull();
  });

  it('switches the Plaid environment', async () => {
    const invoke = bridge();
    render(<Credentials status={STATUS} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText('Plaid environment'), {
      target: { value: 'production' },
    });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('credentials:update', { plaidEnv: 'production' }),
    );
  });

  it('reports the outcome', async () => {
    installMoneyBridge({ 'credentials:update': { message: 'Saved: plaidSecret updated.' } });
    render(<Credentials status={STATUS} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText('Plaid secret'), { target: { value: 'x' } });
    fireEvent.click(screen.getAllByText('Save')[1]!);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('plaidSecret updated'),
    );
  });

  it('surfaces a failure instead of looking like it saved', async () => {
    installMoneyBridge({});
    render(<Credentials status={STATUS} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText('Plaid secret'), { target: { value: 'x' } });
    fireEvent.click(screen.getAllByText('Save')[1]!);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('No stub'));
  });

  it('tells the caller to refresh the configured flags', async () => {
    const onSaved = vi.fn();
    bridge();
    render(<Credentials status={STATUS} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText('Plaid client ID'), { target: { value: 'c' } });
    fireEvent.click(screen.getAllByText('Save')[0]!);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
