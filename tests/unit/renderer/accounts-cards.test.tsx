// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { Accounts } from '@renderer/views/Accounts';

afterEach(cleanup);

const CHASE = {
  id: 'i1', institutionName: 'Chase', status: 'healthy', lastSyncedAt: new Date().toISOString(), accountCount: 1,
  accounts: [{ id: 'a1', name: 'Everyday Checking', mask: '4321', type: 'depository', subtype: 'checking', currentBalanceMinor: 284700, balanceAsOf: null, isEveryday: true }],
};
const AMEX = {
  id: 'i2', institutionName: 'Amex', status: 'reauth_required', lastSyncedAt: '2026-10-30T12:00:00Z', accountCount: 1,
  accounts: [{ id: 'a2', name: 'Gold Card', mask: '1005', type: 'credit', subtype: 'credit card', currentBalanceMinor: -48000, balanceAsOf: null, isEveryday: true }],
};

function setup(): ReturnType<typeof vi.fn> {
  const invoke = vi.fn((channel: string) =>
    channel === 'institutions:list' ? Promise.resolve([CHASE, AMEX]) : Promise.resolve({ ok: true }),
  );
  Object.defineProperty(globalThis.window, 'money', {
    configurable: true,
    value: { invoke, on: () => () => {} },
  });
  return invoke;
}

describe('Accounts as bank cards', () => {
  it('sums every balance into the header', async () => {
    setup();
    render(<Accounts />);
    await waitFor(() => screen.getByText('Net $2,367.00 across 2 accounts'));
  });

  it('shows each bank status, and the sign-in date when it needs one', async () => {
    setup();
    render(<Accounts />);
    await waitFor(() => screen.getByText('Connected'));
    expect(screen.getByText('Action needed')).toBeDefined();
    expect(screen.getByText('Needs sign-in since Oct 30')).toBeDefined();
    expect(screen.getByText('-$480.00')).toBeDefined();
    expect(screen.getByText('••1005')).toBeDefined();
  });

  it('offers Sign in again only on the bank that needs it, and calls reauth', async () => {
    const invoke = setup();
    render(<Accounts />);
    await waitFor(() => screen.getByText('Sign in again'));
    expect(screen.getAllByText('Sign in again')).toHaveLength(1);
    fireEvent.click(screen.getByText('Sign in again'));
    expect(invoke).toHaveBeenCalledWith('institutions:reauth', { institutionId: 'i2' });
  });

  it('the day-to-day toggle calls setEveryday with the flipped value', async () => {
    const invoke = setup();
    render(<Accounts />);
    await waitFor(() => screen.getByLabelText('Include Everyday Checking in day-to-day spending'));
    fireEvent.click(screen.getByLabelText('Include Everyday Checking in day-to-day spending'));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('accounts:setEveryday', { accountId: 'a1', isEveryday: false }),
    );
  });

  it('Disconnect calls the right institution', async () => {
    const invoke = setup();
    render(<Accounts />);
    await waitFor(() => screen.getAllByText('Disconnect'));
    fireEvent.click(screen.getAllByText('Disconnect')[1]!);
    expect(invoke).toHaveBeenCalledWith('institutions:disconnect', { institutionId: 'i2' });
  });
});

describe('Accounts without Plaid', () => {
  const MANUAL = {
    id: 'i9', institutionName: 'Entered by hand', status: 'healthy', lastSyncedAt: null, accountCount: 1, source: 'manual',
    accounts: [{ id: 'a9', name: 'Wallet', mask: null, type: 'depository', subtype: 'checking', currentBalanceMinor: 12000, balanceAsOf: null, isEveryday: true }],
  };
  function withList(list: unknown[]): ReturnType<typeof vi.fn> {
    const invoke = vi.fn((channel: string) =>
      channel === 'institutions:list' ? Promise.resolve(list) : Promise.resolve({ id: 'a10' }),
    );
    Object.defineProperty(globalThis.window, 'money', { configurable: true, value: { invoke, on: () => () => {} } });
    return invoke;
  }

  it('adds an account by hand with its balance', async () => {
    const invoke = withList([]);
    render(<Accounts />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add an account by hand' }));
    fireEvent.change(screen.getByLabelText('Account name'), { target: { value: 'Visa' } });
    fireEvent.change(screen.getByLabelText('Account kind'), { target: { value: 'credit card' } });
    fireEvent.change(screen.getByLabelText('Current balance'), { target: { value: '300.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('accounts:create', {
        name: 'Visa', type: 'credit', subtype: 'credit card', currentBalanceMinor: 30050,
      }),
    );
  });

  it('hides Sync now when no bank is connected', async () => {
    withList([MANUAL]);
    render(<Accounts />);
    await screen.findByText('Wallet');
    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
  });

  it('shows no sync status or Disconnect on the hand-made group', async () => {
    withList([MANUAL]);
    render(<Accounts />);
    await screen.findByText('Wallet');
    expect(screen.queryByText('Connected')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
    expect(screen.getByText('Not synced: entered by hand')).toBeDefined();
  });
});
