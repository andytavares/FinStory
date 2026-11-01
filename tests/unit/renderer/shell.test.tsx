// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { App } from '@renderer/App';
import { installMoneyBridge } from './setup';

afterEach(cleanup);

const CONFIGURED = {
  plaidConfigured: true,
  plaidClientIdConfigured: true,
  plaidSecretConfigured: true,
  plaidEnv: 'sandbox' as const,
  categorizationConfigured: true,
  accountCount: 1,
  encryptionAvailable: true,
};

function bridge(extra: Record<string, unknown> = {}): void {
  installMoneyBridge({
    'setup:status': CONFIGURED,
    'dashboard:get': null,
    'review:queue': { rows: [], totalCount: 8 },
    'alerts:list': [
      { id: 'a', type: 'x', eventOccurredAt: '', detectedAt: '', dismissed: false },
      { id: 'b', type: 'x', eventOccurredAt: '', detectedAt: '', dismissed: true },
    ],
    'transactions:query': { rows: [], totalCount: 0, dataComplete: true, staleInstitutions: [] },
    'categories:list': [],
    ...extra,
  });
}

describe('app shell', () => {
  it('shows every nav group and item', async () => {
    bridge();
    render(<App />);
    await waitFor(() => screen.getByRole('button', { name: 'Dashboard' }));
    for (const group of ['Overview', 'To do', 'Insights', 'Manage', 'System']) {
      expect(screen.getByText(group)).toBeDefined();
    }
    for (const item of [
      'Dashboard', 'Transactions', 'Recurring', 'Income', 'Review', 'Alerts', 'Reports',
      'Usage', 'Categories', 'Rules', 'Accounts', 'Import', 'Health', 'Settings',
    ]) {
      expect(screen.getByRole('button', { name: item })).toBeDefined();
    }
  });

  it('counts review items and undismissed alerts without changing the button name', async () => {
    bridge();
    render(<App />);
    await waitFor(() => screen.getByText('8'));
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Review' })).toBeDefined();
  });

  it('focuses search on Cmd+K and opens Transactions with the text on Enter', async () => {
    bridge();
    render(<App />);
    const search = (await screen.findByPlaceholderText(/Search merchants/)) as HTMLInputElement;
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: 'whole foods' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Transactions' }).getAttribute('aria-current')).toBe('page'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Search: whole foods Clear search' })).toBeDefined());
  });
});
