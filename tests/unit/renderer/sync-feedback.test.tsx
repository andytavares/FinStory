// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Accounts } from '@renderer/views/Accounts';
import { installMoneyBridge } from './setup';

afterEach(cleanup);

const INSTITUTIONS = [
  {
    id: 'i1',
    institutionName: 'Bank',
    accountCount: 1,
    status: 'healthy',
    lastSyncedAt: '2026-08-29T10:00:00Z',
    accounts: [
      {
        id: 'a1',
        name: 'Checking',
        mask: '1111',
        type: 'depository',
        subtype: 'checking',
        currentBalanceMinor: 120000,
        balanceAsOf: null,
        isEveryday: true,
      },
    ],
  },
];

/**
 * "Sync now" used to fire and forget, which is indistinguishable from a button
 * that does nothing. Every outcome must reach the screen.
 */
describe('Sync now reports what happened', () => {
  it('shows the count on a successful run', async () => {
    installMoneyBridge({
      'institutions:list': INSTITUTIONS,
      'sync:now': { message: 'Synced: 42 new transactions.', warning: null },
    });
    render(<Accounts />);
    await waitFor(() => screen.getByText('Sync now'));
    fireEvent.click(screen.getByText('Sync now'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('42 new'));
  });

  it('shows "nothing new" rather than staying silent', async () => {
    installMoneyBridge({
      'institutions:list': INSTITUTIONS,
      'sync:now': { message: 'Synced. Nothing new.', warning: null },
    });
    render(<Accounts />);
    await waitFor(() => screen.getByText('Sync now'));
    fireEvent.click(screen.getByText('Sync now'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Nothing new'));
  });

  it('shows the warning alongside the count', async () => {
    installMoneyBridge({
      'institutions:list': INSTITUTIONS,
      'sync:now': { message: 'Synced: 4 new transactions.', warning: 'The model failed: 401' },
    });
    render(<Accounts />);
    await waitFor(() => screen.getByText('Sync now'));
    fireEvent.click(screen.getByText('Sync now'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('401'));
  });

  it('surfaces a thrown sync failure instead of swallowing it', async () => {
    installMoneyBridge({ 'institutions:list': INSTITUTIONS });
    render(<Accounts />);
    await waitFor(() => screen.getByText('Sync now'));
    fireEvent.click(screen.getByText('Sync now'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('No stub'));
  });

  it('disables the button while a sync is in flight', async () => {
    installMoneyBridge({
      'institutions:list': INSTITUTIONS,
      'sync:now': { message: 'Synced. Nothing new.', warning: null },
    });
    render(<Accounts />);
    await waitFor(() => screen.getByText('Sync now'));
    fireEvent.click(screen.getByText('Sync now'));
    expect(screen.getByText('Syncing…')).toBeDefined();
    await waitFor(() => screen.getByText('Sync now'));
  });
});
