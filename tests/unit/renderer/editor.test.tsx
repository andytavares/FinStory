// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { installMoneyBridge } from './setup';
import { TransactionEditor } from '@renderer/components/TransactionEditor';
import type { TransactionView } from '@shared/types';

afterEach(cleanup);

const CATEGORIES = [
  { id: 'food', name: 'Food', parentId: null, isHidden: false, mergedIntoId: null },
  { id: 'dining', name: 'Dining', parentId: 'food', isHidden: false, mergedIntoId: null },
  { id: 'groceries', name: 'Groceries', parentId: 'food', isHidden: false, mergedIntoId: null },
];

function tx(over: Partial<TransactionView> = {}): TransactionView {
  return {
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
    ...over,
  };
}

describe('transaction editor', () => {
  beforeEach(() => installMoneyBridge({ 'transactions:update': { ok: true } }));

  it('exposes every override the user controls', () => {
    render(<TransactionEditor transaction={tx()} categories={CATEGORIES} />);
    expect(screen.getByLabelText(/^Category for/)).toBeDefined();
    expect(screen.getByText(/Rename \(imported as: UBER EATS\)/)).toBeDefined();
    expect(screen.getByText('Recurring')).toBeDefined();
    expect(screen.getByText('Note')).toBeDefined();
    expect(screen.getByText(/Exclude from spending totals/)).toBeDefined();
  });

  it('has an explicit Save, disabled until something changes', () => {
    render(<TransactionEditor transaction={tx()} categories={CATEGORIES} />);
    const save = screen.getByRole('button', { name: /Save changes/ }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('enables Save once a field is edited', () => {
    render(<TransactionEditor transaction={tx()} categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText(/^Subcategory for/), { target: { value: 'groceries' } });
    expect((screen.getByRole('button', { name: /Save changes/ }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('saves and confirms', async () => {
    render(<TransactionEditor transaction={tx()} categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText(/^Subcategory for/), { target: { value: 'groceries' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(screen.getByText('Saved.')).toBeDefined());
  });

  it('reverts unsaved edits', () => {
    render(<TransactionEditor transaction={tx()} categories={CATEGORIES} />);
    fireEvent.change(screen.getByPlaceholderText('Uber Eats'), { target: { value: 'Dinner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revert' }));
    expect((screen.getByPlaceholderText('Uber Eats') as HTMLInputElement).value).toBe('');
  });

  it('shows an error when saving fails, rather than a false Saved', async () => {
    installMoneyBridge({});
    render(<TransactionEditor transaction={tx()} categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText(/^Subcategory for/), { target: { value: 'groceries' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(screen.getByText('Could not save.')).toBeDefined());
  });

  it('prefills existing overrides', () => {
    render(
      <TransactionEditor
        transaction={tx({
          userMerchantName: 'Dinner with Sam',
          userNote: 'reimbursed',
          userExcluded: true,
          userRecurringOverride: 'not_recurring',
        })}
        categories={CATEGORIES}
      />,
    );
    expect((screen.getByPlaceholderText('Uber Eats') as HTMLInputElement).value).toBe(
      'Dinner with Sam',
    );
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.some((b) => b.checked)).toBe(true);
  });

  it('shows top-level categories in the primary picker', () => {
    render(<TransactionEditor transaction={tx()} categories={CATEGORIES} />);
    const options = Array.from(
      (screen.getByLabelText(/^Category for/) as HTMLSelectElement).options,
    ).map((o) => o.text);
    expect(options).toEqual(['Food']);
  });

  it('prompts for a subcategory once a parent is chosen', () => {
    render(<TransactionEditor transaction={tx({ categoryId: 'food' })} categories={CATEGORIES} />);
    expect(screen.getByText('Choose a subcategory')).toBeDefined();
    const options = Array.from(
      (screen.getByLabelText(/^Subcategory for/) as HTMLSelectElement).options,
    ).map((o) => o.text);
    expect(options).toContain('Dining');
    expect(options).toContain('Groceries');
    expect(options).toContain('+ New subcategory…');
  });

  it('allows keeping the parent when no subcategory fits', () => {
    render(<TransactionEditor transaction={tx({ categoryId: 'food' })} categories={CATEGORIES} />);
    expect(screen.getByText('Keep in Food')).toBeDefined();
  });

  it('reveals an inline input for creating a subcategory', () => {
    render(<TransactionEditor transaction={tx({ categoryId: 'food' })} categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText(/^Subcategory for/), { target: { value: '__new__' } });
    expect(screen.getByLabelText('New subcategory name')).toBeDefined();
  });

  it('creates the subcategory and selects it', async () => {
    installMoneyBridge({
      'categories:create': { id: 'takeout' },
      'transactions:update': { ok: true },
    });
    render(<TransactionEditor transaction={tx({ categoryId: 'food' })} categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText(/^Subcategory for/), { target: { value: '__new__' } });
    fireEvent.change(screen.getByLabelText('New subcategory name'), {
      target: { value: 'Takeout' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    // Selecting the new category makes the editor dirty, so Save enables.
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: /Save changes/ }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });

  it('shows an already-chosen subcategory as the current selection', () => {
    render(<TransactionEditor transaction={tx({ categoryId: 'dining' })} categories={CATEGORIES} />);
    expect((screen.getByLabelText(/^Category for/) as HTMLSelectElement).value).toBe('food');
    expect((screen.getByLabelText(/^Subcategory for/) as HTMLSelectElement).value).toBe('dining');
  });
});

describe('remembering a category for the merchant', () => {
  it('offers to fix past transactions, stating how many', async () => {
    installMoneyBridge({
      'transactions:update': { ok: true, merchantKey: 'uber eats', retroactiveCandidateCount: 12 },
    });
    render(<TransactionEditor transaction={tx({ categoryId: 'food' })} categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText(/^Subcategory for/), { target: { value: 'groceries' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() =>
      expect(screen.getByText(/Apply it to 12 past transactions as well\?/)).toBeDefined(),
    );
    expect(screen.getByText(/will use that category from now on/)).toBeDefined();
  });

  it('promises not to clobber prior manual corrections', async () => {
    installMoneyBridge({
      'transactions:update': { ok: true, merchantKey: 'uber eats', retroactiveCandidateCount: 3 },
    });
    render(<TransactionEditor transaction={tx({ categoryId: 'food' })} categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText(/^Subcategory for/), { target: { value: 'groceries' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() =>
      expect(screen.getByText(/already corrected by hand is left alone/)).toBeDefined(),
    );
  });

  it('does not prompt when there is no history to fix', async () => {
    installMoneyBridge({
      'transactions:update': { ok: true, merchantKey: 'uber eats', retroactiveCandidateCount: 0 },
    });
    render(<TransactionEditor transaction={tx({ categoryId: 'food' })} categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText(/^Subcategory for/), { target: { value: 'groceries' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(screen.getByText('Saved.')).toBeDefined());
    expect(screen.queryByText(/past transaction/)).toBeNull();
  });

  it('lets the user decline and keep the change forward-only', async () => {
    installMoneyBridge({
      'transactions:update': { ok: true, merchantKey: 'uber eats', retroactiveCandidateCount: 5 },
    });
    render(<TransactionEditor transaction={tx({ categoryId: 'food' })} categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText(/^Subcategory for/), { target: { value: 'groceries' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => screen.getByRole('button', { name: 'Going forward only' }));
    fireEvent.click(screen.getByRole('button', { name: 'Going forward only' }));
    await waitFor(() => expect(screen.queryByText(/past transaction/)).toBeNull());
  });
});
