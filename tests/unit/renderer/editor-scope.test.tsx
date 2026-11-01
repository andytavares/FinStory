// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { installMoneyBridge } from './setup';
import { TransactionEditor } from '@renderer/components/TransactionEditor';
import type { TransactionView } from '@shared/types';

afterEach(cleanup);

const CATEGORIES = [
  { id: 'dining', name: 'Dining', parentId: null, isHidden: false, mergedIntoId: null },
  { id: 'groceries', name: 'Groceries', parentId: null, isHidden: false, mergedIntoId: null },
];

const TRANSACTION: TransactionView = {
  id: 't1',
  amountMinor: -4312,
  merchantName: 'Uber Eats',
  merchantKey: 'uber eats',
  isRecurring: false,
  description: 'UBER EATS',
  postedDate: '2026-08-29',
  categoryId: 'dining',
  confidence: 0.9,
  needsReview: false,
  isInternalTransfer: false,
  originalCurrency: null,
  originalAmountMinor: null,
  userMerchantName: null,
  userNote: null,
  userExcluded: false,
  userRecurringOverride: null,
};

const RULE = {
  merchantKey: 'uber eats',
  merchantName: 'Uber Eats',
  displayName: null,
  categoryId: 'dining',
  categoryName: 'Dining',
  transactionCount: 3,
  oneOffCount: 0,
};

function bridge(rules: unknown[]): ReturnType<typeof vi.fn> {
  const invoke = vi.fn((channel: string) =>
    Promise.resolve(channel === 'rules:list' ? rules : { ok: true }),
  );
  installMoneyBridge({});
  Object.defineProperty(globalThis.window, 'money', {
    configurable: true,
    value: { invoke, on: () => () => undefined },
  });
  return invoke;
}

describe('editor scope control', () => {
  it('defaults to this transaction and sends scope transaction', async () => {
    const invoke = bridge([]);
    render(<TransactionEditor transaction={TRANSACTION} categories={CATEGORIES} />);
    expect(screen.getByRole('button', { name: 'This transaction' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.change(screen.getByLabelText(/^Category for/), { target: { value: 'groceries' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'transactions:update',
        expect.objectContaining({ scope: 'transaction', categoryId: 'groceries' }),
      ),
    );
  });

  it('sends scope merchant once All is chosen', async () => {
    const invoke = bridge([]);
    render(<TransactionEditor transaction={TRANSACTION} categories={CATEGORIES} />);
    fireEvent.click(screen.getByRole('button', { name: /^All Uber Eats/ }));
    fireEvent.change(screen.getByLabelText(/^Category for/), { target: { value: 'groceries' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'transactions:update',
        expect.objectContaining({ scope: 'merchant' }),
      ),
    );
  });

  it('says an existing rule is not changed by a one-off edit', async () => {
    bridge([RULE]);
    render(<TransactionEditor transaction={TRANSACTION} categories={CATEGORIES} />);
    await waitFor(() =>
      expect(
        screen.getByText('A rule already sorts Uber Eats into Dining. This edit changes only this one charge.'),
      ).toBeDefined(),
    );
    fireEvent.click(screen.getByRole('button', { name: /^All Uber Eats/ }));
    expect(screen.queryByText(/This edit changes only this one charge/)).toBeNull();
  });
});
