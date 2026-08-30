// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { installMoneyBridge } from './setup';
import { Register } from '@renderer/views/Register';

afterEach(cleanup);

const tx = (o: Record<string, unknown> = {}) => ({
  id: 't1',
  amountMinor: -4312,
  merchantName: 'Uber Eats',
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
  ...o,
});

const CATS = [
  { id: 'food', name: 'Food', parentId: null, isHidden: false, mergedIntoId: null },
  { id: 'dining', name: 'Dining', parentId: 'food', isHidden: false, mergedIntoId: null },
];

describe('Register', () => {
  beforeEach(() =>
    installMoneyBridge({
      'transactions:query': {
        rows: [tx(), tx({ id: 't2', amountMinor: 520_000, description: 'PAYROLL', merchantName: 'Acme' })],
        totalCount: 2,
        dataComplete: true,
        staleInstitutions: [],
      },
      'categories:list': CATS,
      'transactions:update': { ok: true, merchantKey: null, retroactiveCandidateCount: 0 },
    }),
  );

  it('shows income and spending together with a running summary', async () => {
    render(<Register initialCategoryId={null} />);
    await waitFor(() => expect(screen.getByText('Acme')).toBeDefined());
    expect(screen.getByText(/in ·/)).toBeDefined();
    expect(screen.getByText(/newest first/)).toBeDefined();
  });

  it('offers direction filters', async () => {
    render(<Register initialCategoryId={null} />);
    await waitFor(() => screen.getByRole('button', { name: 'Money in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Money in' }));
    expect(screen.getByRole('button', { name: 'Money in' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Money out' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
  });

  it('opens and closes the per-transaction editor', async () => {
    render(<Register initialCategoryId={null} />);
    await waitFor(() => screen.getAllByText('Edit'));
    fireEvent.click(screen.getAllByText('Edit')[0]!);
    expect(screen.getByText(/Exclude from spending totals/)).toBeDefined();
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByText(/Exclude from spending totals/)).toBeNull();
  });

  it('marks an unconfirmed transaction until it is changed', async () => {
    installMoneyBridge({
      'transactions:query': {
        rows: [tx({ needsReview: true })],
        totalCount: 1,
        dataComplete: true,
        staleInstitutions: [],
      },
      'categories:list': CATS,
      'transactions:update': { ok: true, merchantKey: null, retroactiveCandidateCount: 0 },
    });
    render(<Register initialCategoryId={null} />);
    await waitFor(() => expect(screen.getByText('unconfirmed')).toBeDefined());
    fireEvent.change(screen.getByLabelText(/Category for Uber Eats/), {
      target: { value: 'food' },
    });
    await waitFor(() => expect(screen.queryByText('unconfirmed')).toBeNull());
  });

  it('renders the qualification banner when data is incomplete', async () => {
    installMoneyBridge({
      'transactions:query': {
        rows: [tx()],
        totalCount: 1,
        dataComplete: false,
        staleInstitutions: ['Chase'],
      },
      'categories:list': CATS,
    });
    render(<Register initialCategoryId={null} />);
    await waitFor(() => expect(screen.getByText(/lower bounds/)).toBeDefined());
  });
});

describe('past overrides are offered wherever a transaction is edited', () => {
  it('offers the retroactive fix from the inline category dropdown', async () => {
    installMoneyBridge({
      'transactions:query': {
        rows: [tx()],
        totalCount: 1,
        dataComplete: true,
        staleInstitutions: [],
      },
      'categories:list': CATS,
      'transactions:update': {
        ok: true,
        merchantKey: 'uber eats',
        retroactiveCandidateCount: 9,
      },
    });
    render(<Register initialCategoryId={null} />);
    await waitFor(() => screen.getByLabelText(/Category for Uber Eats/));
    fireEvent.change(screen.getByLabelText(/Category for Uber Eats/), {
      target: { value: 'food' },
    });
    await waitFor(() =>
      expect(screen.getByText(/Apply it to 9 past transactions too\?/)).toBeDefined(),
    );
    expect(screen.getByText(/already corrected by hand is left alone/)).toBeDefined();
  });

  it('does not prompt when there is nothing in the past to fix', async () => {
    installMoneyBridge({
      'transactions:query': {
        rows: [tx()],
        totalCount: 1,
        dataComplete: true,
        staleInstitutions: [],
      },
      'categories:list': CATS,
      'transactions:update': { ok: true, merchantKey: 'uber eats', retroactiveCandidateCount: 0 },
    });
    render(<Register initialCategoryId={null} />);
    await waitFor(() => screen.getByLabelText(/Category for Uber Eats/));
    fireEvent.change(screen.getByLabelText(/Category for Uber Eats/), {
      target: { value: 'food' },
    });
    await waitFor(() => expect(screen.queryByText(/past transaction/)).toBeNull());
  });

  it('lets the user keep the change forward-only', async () => {
    installMoneyBridge({
      'transactions:query': {
        rows: [tx()],
        totalCount: 1,
        dataComplete: true,
        staleInstitutions: [],
      },
      'categories:list': CATS,
      'transactions:update': { ok: true, merchantKey: 'uber eats', retroactiveCandidateCount: 4 },
    });
    render(<Register initialCategoryId={null} />);
    await waitFor(() => screen.getByLabelText(/Category for Uber Eats/));
    fireEvent.change(screen.getByLabelText(/Category for Uber Eats/), {
      target: { value: 'food' },
    });
    await waitFor(() => screen.getByRole('button', { name: 'Going forward only' }));
    fireEvent.click(screen.getByRole('button', { name: 'Going forward only' }));
    await waitFor(() => expect(screen.queryByText(/past transactions too/)).toBeNull());
  });
});
