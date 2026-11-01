// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { Register } from '@renderer/views/Register';

afterEach(cleanup);

const tx = (o: Record<string, unknown> = {}) => ({
  id: 't1',
  amountMinor: -4312,
  merchantName: 'Uber Eats',
  merchantKey: 'uber eats',
  isRecurring: false,
  description: 'UBER EATS',
  postedDate: '2026-08-29',
  categoryId: 'dining',
  confidence: 0.9,
  categorySource: null,
  needsReview: false,
  isInternalTransfer: false,
  originalCurrency: null,
  originalAmountMinor: null,
  userMerchantName: null,
  userNote: null,
  userExcluded: false,
  userRecurringOverride: null,
  ...o,
});

const CATS = [
  { id: 'food', name: 'Food', parentId: null, isHidden: false, mergedIntoId: null },
  { id: 'dining', name: 'Dining', parentId: 'food', isHidden: false, mergedIntoId: null },
];

const INSTITUTIONS = [
  {
    id: 'i1',
    institutionName: 'Bank',
    accounts: [{ id: 'a1', name: 'Gold Card', mask: '1005' }, { id: 'a2', name: 'Checking', mask: '2' }],
  },
];

function bridge(rows: unknown[] = [tx()], extra: Record<string, unknown> = {}): ReturnType<typeof vi.fn> {
  const responses: Record<string, unknown> = {
    'transactions:query': { rows, totalCount: rows.length, excludedCount: 0, dataComplete: true, staleInstitutions: [] },
    'categories:list': CATS,
    'institutions:list': INSTITUTIONS,
    'rules:list': [],
    'transactions:update': { ok: true, merchantKey: null, retroactiveCandidateCount: 0 },
    ...extra,
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

const lastQuery = (invoke: ReturnType<typeof vi.fn>): Record<string, unknown> =>
  invoke.mock.calls.filter((c) => c[0] === 'transactions:query').at(-1)![1] as Record<string, unknown>;

describe('Register filters', () => {
  it('sends the direction, account, category, period and needs-review filters', async () => {
    const invoke = bridge([tx({ needsReview: true })]);
    render(<Register initialCategoryId={null} />);
    await waitFor(() => screen.getByText('Uber Eats'));

    fireEvent.click(screen.getByRole('button', { name: 'Money out' }));
    await waitFor(() => expect(lastQuery(invoke)).toMatchObject({ direction: 'out' }));

    fireEvent.click(screen.getByRole('button', { name: /^Account: All/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Gold Card' }));
    await waitFor(() => expect(lastQuery(invoke)).toMatchObject({ accountIds: ['a1'] }));

    fireEvent.click(screen.getByRole('button', { name: /^Category: Any/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Food' }));
    await waitFor(() => expect(lastQuery(invoke)).toMatchObject({ categoryIds: ['food'] }));

    fireEvent.click(screen.getByRole('button', { name: /^All dates/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));
    await waitFor(() => expect(lastQuery(invoke)).toHaveProperty('periodStart'));
    expect(lastQuery(invoke)).toHaveProperty('periodEnd');

    fireEvent.click(screen.getByRole('switch', { name: /Needs review · 1/ }));
    await waitFor(() => expect(lastQuery(invoke)).toMatchObject({ needsReviewOnly: true }));
  });

  it('starts in the category it was opened with', async () => {
    const invoke = bridge();
    render(<Register initialCategoryId="food" />);
    await waitFor(() => expect(lastQuery(invoke)).toMatchObject({ categoryIds: ['food'], spendingOnly: false }));
    expect(screen.getByRole('button', { name: /^Category: Food/ })).toBeDefined();
  });

  it('shows the in and out totals and the period count', async () => {
    bridge([tx(), tx({ id: 't2', amountMinor: 520_000, merchantName: 'Acme' })]);
    render(<Register initialCategoryId={null} />);
    await waitFor(() => screen.getByText('Acme'));
    expect(screen.getByText('+$5,200.00')).toBeDefined();
    expect(screen.getByText('−$43.12')).toBeDefined();
    expect(screen.getByText('2 this period')).toBeDefined();
  });

  it('narrows to what counted toward spending, and back', async () => {
    bridge();
    render(<Register initialCategoryId="food" />);
    fireEvent.click(await screen.findByText('Show only what counted toward spending'));
    await waitFor(() => screen.getByText(/Showing only what counted toward the spending total/));
    fireEvent.click(screen.getByText(/^Show all/));
    await waitFor(() => screen.getByText(/Every transaction in this category/));
  });

  it('exports the loaded rows as CSV', async () => {
    bridge();
    const createObjectURL = vi.fn(() => 'blob:csv');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    render(<Register initialCategoryId={null} />);
    await waitFor(() => screen.getByText('Uber Eats'));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(createObjectURL).toHaveBeenCalledOnce();
  });
});

describe('Register rows', () => {
  it('shows who set each category and flags the unsure ones', async () => {
    bridge([
      tx({ id: 'a', merchantName: 'Whole Foods', needsReview: true }),
      tx({ id: 'b', merchantName: 'Shell', categorySource: 'user' }),
      tx({ id: 'c', merchantName: 'Target', categorySource: 'rule' }),
      tx({ id: 'd', merchantName: 'Blue Bottle', categorySource: 'model' }),
    ]);
    render(<Register initialCategoryId={null} />);
    await waitFor(() => screen.getByText('Shell'));
    expect(screen.getAllByText('Check')).toHaveLength(1);
    expect(screen.getAllByText('You set this')).toHaveLength(1);
    expect(screen.getAllByText('Your rule')).toHaveLength(1);
  });

  it('opens the edit drawer for the selected row and closes it', async () => {
    bridge();
    render(<Register initialCategoryId={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Uber Eats' }));
    expect(screen.getByText('Apply this change to')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Apply this change to')).toBeNull();
  });

  it('sends the chosen scope when the drawer saves', async () => {
    const invoke = bridge();
    render(<Register initialCategoryId={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Uber Eats' }));
    const drawer = screen.getByRole('complementary');
    fireEvent.click(within(drawer).getByRole('button', { name: /^All Uber Eats/ }));
    fireEvent.change(within(drawer).getByLabelText(/^Category for/), { target: { value: 'food' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'transactions:update',
        expect.objectContaining({ scope: 'merchant', categoryId: 'food' }),
      ),
    );
  });

  it('shows an empty state when nothing matches', async () => {
    bridge([]);
    render(<Register initialCategoryId={null} />);
    await waitFor(() => screen.getByText(/No transactions match/));
  });
});
