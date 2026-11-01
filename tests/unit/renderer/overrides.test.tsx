// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Overrides } from '@renderer/views/Overrides';
import { installMoneyBridge } from './setup';

afterEach(cleanup);

const RECORDS = [
  {
    id: 'transaction_name:t1',
    kind: 'transaction_name',
    target: 't1',
    label: 'Dinner delivery',
    original: 'Uber Eats',
    current: 'Dinner delivery',
    affectedCount: 14,
    occurredAt: '2026-08-20',
  },
  {
    id: 'excluded:t9',
    kind: 'excluded',
    target: 't9',
    label: 'Venmo',
    original: 'Counted',
    current: 'Excluded from totals',
    affectedCount: 1,
    occurredAt: '2026-08-18',
  },
];

const RULE = {
  merchantKey: 'uber eats',
  merchantName: 'Uber Eats',
  displayName: 'Dinner delivery',
  categoryId: 'dining',
  categoryName: 'Dining',
  transactionCount: 14,
  oneOffCount: 2,
};
const CATEGORIES = [{ id: 'dining', name: 'Dining', parentId: null, isHidden: false, mergedIntoId: null }];

function bridge(overrides: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const responses: Record<string, unknown> = {
    'rules:list': [],
    'overrides:list': [],
    'categories:list': CATEGORIES,
    ...overrides,
  };
  const invoke = vi.fn((channel: string) => Promise.resolve(responses[channel] ?? { ok: true }));
  installMoneyBridge({});
  Object.defineProperty(globalThis.window, 'money', {
    configurable: true,
    value: { invoke, on: () => () => {} },
  });
  return invoke;
}

async function openOneOffs(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: /^One-off changes/ }));
}

describe('the rules page', () => {
  it('shows a merchant rule with its counts and removes it', async () => {
    const invoke = bridge({ 'rules:list': [RULE] });
    render(<Overrides />);
    await screen.findByText('14 charges · past and future');
    expect(screen.getByText('2 one-off')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Merchant rules · 1' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('rules:delete', { merchantKey: 'uber eats' }),
    );
  });

  it('edits a rule inline and saves only what changed', async () => {
    const invoke = bridge({ 'rules:list': [RULE] });
    render(<Overrides />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name for Uber Eats'), { target: { value: 'Food' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('rules:update', {
        merchantKey: 'uber eats',
        displayName: 'Food',
      }),
    );
  });
});

describe('the one-off changes tab', () => {
  it('says so when the user has overridden nothing', async () => {
    bridge({});
    render(<Overrides />);
    await openOneOffs();
    await waitFor(() =>
      expect(screen.getByText('You have not made any one-off changes yet')).toBeDefined(),
    );
  });

  it('groups overrides by what they are', async () => {
    bridge({ 'overrides:list': RECORDS });
    render(<Overrides />);
    await openOneOffs();
    await waitFor(() => expect(screen.getByText('Single transaction renames')).toBeDefined());
    expect(screen.getByText('Excluded from totals')).toBeDefined();
  });

  it('shows what the override replaced', async () => {
    bridge({ 'overrides:list': RECORDS });
    render(<Overrides />);
    await openOneOffs();
    await waitFor(() =>
      expect(screen.getByText('Uber Eats → Dinner delivery')).toBeDefined(),
    );
  });

  it('shows how many transactions each override reaches', async () => {
    bridge({ 'overrides:list': RECORDS });
    render(<Overrides />);
    await openOneOffs();
    await waitFor(() => expect(screen.getByText(/14 transactions/)).toBeDefined());
    expect(screen.getByText(/1 transaction ·/)).toBeDefined();
  });

  it('counts them', async () => {
    bridge({ 'overrides:list': RECORDS });
    render(<Overrides />);
    await openOneOffs();
    expect(await screen.findByRole('button', { name: 'One-off changes · 2' })).toBeDefined();
  });

  it('undoes one through the clear channel', async () => {
    const invoke = bridge({ 'overrides:list': RECORDS });
    render(<Overrides />);
    await openOneOffs();
    await waitFor(() => screen.getByLabelText('Undo override for Dinner delivery'));
    fireEvent.click(screen.getByLabelText('Undo override for Dinner delivery'));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('overrides:clear', {
        kind: 'transaction_name',
        target: 't1',
      }),
    );
  });
});
