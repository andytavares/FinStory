// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { Review } from '@renderer/views/Review';

afterEach(cleanup);

const item = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  transaction: {
    id,
    amountMinor: -1500,
    merchantName: name,
    merchantKey: name.toLowerCase(),
    description: name.toUpperCase(),
    postedDate: '2026-10-31',
    categoryId: 'groceries',
    confidence: 0.5,
    needsReview: true,
    isInternalTransfer: false,
    isRecurring: false,
    originalCurrency: null,
    originalAmountMinor: null,
    userMerchantName: null,
    userNote: null,
    userExcluded: false,
    userRecurringOverride: null,
  },
  guessCategoryId: 'groceries',
  guessCategoryName: 'Groceries',
  suggestions: [
    { categoryId: 'groceries', name: 'Groceries' },
    { categoryId: 'dining', name: 'Dining & Takeout' },
    { categoryId: 'household', name: 'Household' },
  ],
  confidence: 0.5,
  reasoning: 'Grocery store; could be prepared food.',
  ...over,
});

const CATS = ['groceries', 'dining', 'household', 'gifts'].map((id) => ({
  id,
  name: id,
  parentId: null,
  isHidden: false,
  mergedIntoId: null,
}));

function bridge(rows: unknown[]): ReturnType<typeof vi.fn> {
  const responses: Record<string, unknown> = {
    'review:queue': { rows, totalCount: rows.length },
    'categories:list': CATS,
    'review:recategorize': { updated: 1, retroactiveCandidateCount: 0 },
    'review:dismissFlag': { ok: true },
    'rules:update': { ok: true },
    'model:status': { localOnly: false, reason: '' },
  };
  const invoke = vi.fn((channel: string) =>
    channel in responses ? Promise.resolve(responses[channel]) : Promise.reject(new Error(channel)),
  );
  Object.defineProperty(globalThis.window, 'money', {
    configurable: true,
    value: { invoke, on: () => () => {} },
  });
  return invoke;
}

const rows = (): unknown[] => [item('t1', 'Whole Foods'), item('t2', 'Apple Store')];

describe('Review', () => {
  it('names the count and labels the first suggestion with its confidence', async () => {
    bridge(rows());
    render(<Review />);
    await screen.findByText('2 charges Money was unsure about');
    expect(screen.getAllByRole('button', { name: /^1 Groceries · 50%$/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^2 Dining & Takeout$/ })).toHaveLength(2);
    expect(screen.getAllByText('Grocery store; could be prepared food.')).toHaveLength(2);
    expect(screen.getByText('0 of 2 done')).toBeDefined();
  });

  it('recategorizes with the clicked suggestion', async () => {
    const invoke = bridge(rows());
    render(<Review />);
    fireEvent.click((await screen.findAllByRole('button', { name: /^2 Dining/ }))[0]!);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('review:recategorize', {
        transactionIds: ['t1'],
        categoryId: 'dining',
      }),
    );
  });

  it('also creates the merchant rule when Always for is on', async () => {
    const invoke = bridge(rows());
    render(<Review />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Always for Whole Foods' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^3 Household/ })[0]!);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('rules:update', {
        merchantKey: 'whole foods',
        categoryId: 'household',
      }),
    );
  });

  it('does not create a rule when Always for is off', async () => {
    const invoke = bridge(rows());
    render(<Review />);
    fireEvent.click((await screen.findAllByRole('button', { name: /^3 Household/ }))[0]!);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:recategorize', expect.anything()));
    expect(invoke).not.toHaveBeenCalledWith('rules:update', expect.anything());
  });

  it('picks from the full list under Other', async () => {
    const invoke = bridge(rows());
    render(<Review />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Other…' }))[0]!);
    fireEvent.change(screen.getByLabelText('Other category for Whole Foods'), { target: { value: 'gifts' } });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('review:recategorize', { transactionIds: ['t1'], categoryId: 'gifts' }),
    );
  });

  it('keys 1 to 3 pick for the focused item, Enter accepts, S skips to the next', async () => {
    const invoke = bridge(rows());
    render(<Review />);
    await screen.findByText('2 charges Money was unsure about');
    fireEvent.keyDown(window, { key: '2' });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('review:recategorize', { transactionIds: ['t1'], categoryId: 'dining' }),
    );
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('review:dismissFlag', { transactionIds: ['t2'] }),
    );
  });

  it('accepts every guess at once', async () => {
    const invoke = bridge(rows());
    render(<Review />);
    fireEvent.click(await screen.findByRole('button', { name: 'Accept all 2 guesses' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('review:dismissFlag', { transactionIds: ['t1', 't2'] }),
    );
  });

  it('uses the user name override in labels', async () => {
    bridge([item('t1', 'Uber Eats', { transaction: { ...(item('t1', 'Uber Eats').transaction), userMerchantName: 'Dinner delivery' } })]);
    render(<Review />);
    await screen.findByRole('switch', { name: 'Always for Dinner delivery' });
    expect(screen.queryByText('UBER EATS')).toBeNull();
  });

  it('shows an empty state when the queue is clear', async () => {
    bridge([]);
    render(<Review />);
    await screen.findByText(/Nothing needs your review/);
  });
});
