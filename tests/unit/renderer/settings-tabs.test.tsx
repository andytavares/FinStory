// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { Settings } from '@renderer/views/Settings';

afterEach(cleanup);

const SETTINGS = {
  modelProvider: 'ollama',
  anthropicModel: 'claude-haiku-4-5',
  anthropicWorkspaceId: '',
  ollamaModel: 'llama3.1:8b',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  pollIntervalMinutes: 60,
  usageRetention: '365',
  lastBackupAt: null,
};
const STATUS = {
  plaidConfigured: true, plaidClientIdConfigured: true, plaidSecretConfigured: true,
  plaidEnv: 'sandbox', categorizationConfigured: true, accountCount: 1, encryptionAvailable: true,
};
const HEALTH = {
  encryption: { databaseEncrypted: true, keysInKeychain: false },
  updates: { version: '1.1.0' },
};

function setup(overrides: Record<string, unknown> = {}): ReturnType<typeof vi.fn> {
  const responses: Record<string, unknown> = {
    'settings:get': SETTINGS,
    'setup:status': STATUS,
    'health:get': HEALTH,
    'settings:update': {},
    'models:listOllama': [{ name: 'llama3.1:8b' }, { name: 'qwen2.5:7b' }],
    ...overrides,
  };
  const invoke = vi.fn((channel: string) =>
    channel in responses
      ? responses[channel] instanceof Error
        ? Promise.reject(responses[channel])
        : Promise.resolve(responses[channel])
      : Promise.reject(new Error(`No stub for ${channel}`)),
  );
  Object.defineProperty(globalThis.window, 'money', {
    configurable: true,
    value: { invoke, on: () => () => {} },
  });
  return invoke;
}

describe('Settings tabs jump through one scrolling page', () => {
  it('lists the five tabs, with General current at first', async () => {
    setup();
    render(<Settings />);
    await waitFor(() => screen.getByRole('button', { name: 'General' }));
    for (const tab of ['General', 'Categorization', 'Credentials', 'Data and privacy', 'Updates']) {
      expect(screen.getByRole('button', { name: tab })).toBeDefined();
    }
    expect(screen.getByRole('button', { name: 'General' }).getAttribute('aria-current')).toBe('page');
  });

  it('scrolls the page body and marks the tab current on click', async () => {
    setup();
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;
    render(
      <div className="ds-body">
        <Settings />
      </div>,
    );
    await waitFor(() => screen.getByRole('button', { name: 'Data and privacy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Data and privacy' }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Data and privacy' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'General' }).getAttribute('aria-current')).toBeNull();
  });

  it('keeps Reset everything reachable without a tab click', async () => {
    setup();
    render(<Settings />);
    await waitFor(() => screen.getByRole('button', { name: /Reset everything/ }));
  });
});

describe('Settings values', () => {
  it('saves the usage history choice', async () => {
    const invoke = setup();
    render(<Settings />);
    await waitFor(() => screen.getByRole('button', { name: 'Forever' }));
    expect(screen.getByRole('button', { name: '1 year' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Forever' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('settings:update', { usageRetention: 'forever' }),
    );
    expect(screen.getByRole('button', { name: 'Forever' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows Ollama as running with the model count when listing works', async () => {
    setup();
    render(<Settings />);
    await waitFor(() => screen.getByText('Ollama running'));
    expect(screen.getByText('2 chat models')).toBeDefined();
  });

  it('shows the error in the status chip when Ollama is down', async () => {
    setup({ 'models:listOllama': new Error('Ollama is not running at http://127.0.0.1:11434.') });
    render(<Settings />);
    await waitFor(() => screen.getByText(/Ollama is not running at/));
    expect(screen.queryByText('Ollama running')).toBeNull();
  });

  it('lists Ollama, Claude, History only as radios named by their title, each described by what leaves the machine', async () => {
    setup();
    render(<Settings />);
    const radios = await screen.findAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-labelledby'))).toEqual([
      'provider-ollama-title',
      'provider-anthropic-title',
      'provider-local_only-title',
    ]);
    expect(radios.map((r) => document.getElementById(r.getAttribute('aria-labelledby') ?? '')?.textContent)).toEqual([
      'Ollama (local)',
      'Claude',
      'History only',
    ]);
    const described = (r: HTMLElement): string =>
      document.getElementById(r.getAttribute('aria-describedby') ?? '')?.textContent ?? '';
    expect(described(radios[0]!)).toMatch(/Nothing leaves this machine at all/);
    expect(described(radios[1]!)).toMatch(/Never account numbers, balances/);
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true');
  });

  it('switching provider saves it', async () => {
    const invoke = setup();
    render(<Settings />);
    await waitFor(() => screen.getByText('Ollama running'));
    fireEvent.click(screen.getAllByRole('radio')[2]!);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('settings:update', { modelProvider: 'local_only' }),
    );
    expect(screen.queryByText('Ollama running')).toBeNull();
  });

  it('shows the app version and the update schedule', async () => {
    setup();
    render(<Settings />);
    await waitFor(() => screen.getByText('Version 1.1.0'));
    expect(screen.getByText('Money checks for updates at launch and every 6 hours.')).toBeDefined();
  });
});

describe('Data and privacy reflects health:get', () => {
  it('turns a chip off when the key is not in the keychain', async () => {
    setup();
    render(<Settings />);
    await waitFor(() => screen.getByText('Encrypted on disk (ChaCha20-Poly1305)'));
    expect(screen.getAllByText('On')).toHaveLength(1);
    expect(screen.getAllByText('Off')).toHaveLength(2);
    expect(screen.getByText('Local')).toBeDefined();
  });

  it('says Unknown instead of guessing when health cannot be read', async () => {
    setup({ 'health:get': new Error('down') });
    render(<Settings />);
    await waitFor(() => screen.getByText('Encrypted on disk (ChaCha20-Poly1305)'));
    expect(screen.getAllByText('Unknown')).toHaveLength(3);
  });

  it('says when the last backup was, and never when there is none', async () => {
    setup({ 'settings:get': { ...SETTINGS, lastBackupAt: '2026-10-30T12:00:00Z' } });
    render(<Settings />);
    await waitFor(() => screen.getByText(/Last backup: Oct 30\./));
  });

  it('asks for the passphrase before backing up', async () => {
    const invoke = setup({ 'data:export': {} });
    render(<Settings />);
    await waitFor(() => screen.getByRole('button', { name: 'Back up now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    fireEvent.change(screen.getByLabelText('Backup passphrase'), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back up' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('data:export', { destPath: '', passphrase: 'correct horse battery' }),
    );
  });
});
