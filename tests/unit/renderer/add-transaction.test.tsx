// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AddTransaction } from '@renderer/components/AddTransaction';

afterEach(cleanup);

const INSTITUTIONS = [
  {
    id: 'i1',
    institutionName: 'Chase',
    status: 'healthy',
    lastSyncedAt: null,
    accountCount: 1,
    accounts: [{ id: 'a1', name: 'Checking', mask: '1111', type: 'depository', subtype: 'checking', currentBalanceMinor: 0, isEveryday: true }],
  },
];
const CATEGORIES = [{ id: 'groceries', name: 'Groceries', parentId: 'food', isHidden: false, mergedIntoId: null }];

function installBridge(): ReturnType<typeof vi.fn> {
  const invoke = vi.fn((channel: string) =>
    channel === 'institutions:list' ? Promise.resolve(INSTITUTIONS) : Promise.resolve({ id: 'txn_x' }),
  );
  Object.defineProperty(globalThis.window, 'money', { configurable: true, value: { invoke, on: () => () => {} } });
  return invoke;
}

async function fill(direction: 'out' | 'in'): Promise<void> {
  render(<AddTransaction categories={CATEGORIES} onClose={() => {}} onAdded={() => {}} />);
  await screen.findByText('Chase · Checking');
  fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'a1' } });
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-20' } });
  fireEvent.change(screen.getByLabelText('Payee'), { target: { value: 'Farmers market' } });
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12.50' } });
  fireEvent.change(screen.getByLabelText('Direction'), { target: { value: direction } });
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'groceries' } });
  fireEvent.click(screen.getByText('Add'));
}

describe('adding a transaction by hand', () => {
  it('sends money out as a negative amount in minor units', async () => {
    const invoke = installBridge();
    await fill('out');
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('transactions:create', {
        accountId: 'a1',
        postedDate: '2026-08-20',
        amountMinor: -1250,
        payee: 'Farmers market',
        categoryId: 'groceries',
      }),
    );
  });

  it('sends money in as a positive amount', async () => {
    const invoke = installBridge();
    await fill('in');
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('transactions:create', expect.objectContaining({ amountMinor: 1250 })),
    );
  });

  it('refuses to submit without an amount', async () => {
    const invoke = installBridge();
    render(<AddTransaction categories={CATEGORIES} onClose={() => {}} onAdded={() => {}} />);
    await screen.findByText('Chase · Checking');
    fireEvent.click(screen.getByText('Add'));
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(invoke).not.toHaveBeenCalledWith('transactions:create', expect.anything());
  });
});
