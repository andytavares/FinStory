// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { installMoneyBridge } from './setup';
import { Categories } from '@renderer/views/Categories';
import { Alerts } from '@renderer/views/Alerts';

afterEach(cleanup);

const CATS = [
  { id: 'food', name: 'Food', parentId: null, isSystem: true, isHidden: false, mergedIntoId: null, usageCount: 0, childCount: 0, needsReassignment: false },
  { id: 'dining', name: 'Dining', parentId: 'food', isSystem: true, isHidden: false, mergedIntoId: null, usageCount: 0, childCount: 0, needsReassignment: false },
  { id: 'custom', name: 'Custom', parentId: null, isSystem: false, isHidden: true, mergedIntoId: null, usageCount: 0, childCount: 0, needsReassignment: false },
];

describe('Categories screen', () => {
  beforeEach(() =>
    installMoneyBridge({
      'categories:list': CATS,
      'categories:create': { id: 'new' },
      'categories:rename': { ok: true },
      'categories:setHidden': { ok: true },
      'categories:merge': { movedCount: 3 },
    }),
  );

  it('shows parents with their children nested', async () => {
    render(<Categories />);
    await waitFor(() => expect(screen.getByLabelText('Name for Food')).toBeDefined());
    expect(screen.getByLabelText('Name for Dining')).toBeDefined();
  });

  it('adds a top-level category on Enter', async () => {
    render(<Categories />);
    await waitFor(() => screen.getByLabelText('New top-level category'));
    const input = screen.getByLabelText('New top-level category');
    fireEvent.change(input, { target: { value: 'Pets' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
  });

  it('opens and cancels the subcategory input', async () => {
    render(<Categories />);
    await waitFor(() => screen.getAllByText('+ Add subcategory'));
    // Sorted alphabetically, so target Food explicitly rather than by position.
    fireEvent.click(screen.getByLabelText('Add a subcategory under Food'));
    const input = screen.getByLabelText('New subcategory under Food');
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByLabelText('New subcategory under Food')).toBeNull(),
    );
  });

  it('creates a subcategory on Enter', async () => {
    render(<Categories />);
    await waitFor(() => screen.getAllByText('+ Add subcategory'));
    // Sorted alphabetically, so target Food explicitly rather than by position.
    fireEvent.click(screen.getByLabelText('Add a subcategory under Food'));
    const input = screen.getByLabelText('New subcategory under Food');
    fireEvent.change(input, { target: { value: 'Takeout' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(screen.queryByLabelText('New subcategory under Food')).toBeNull(),
    );
  });

  it('renames on blur only when the name actually changed', async () => {
    render(<Categories />);
    await waitFor(() => screen.getByLabelText('Name for Food'));
    const input = screen.getByLabelText('Name for Food');
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: 'Eating' } });
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe('Eating');
  });

  it('reveals merge targets and excludes the category itself', async () => {
    render(<Categories />);
    await waitFor(() => screen.getAllByText('Merge'));
    fireEvent.click(screen.getByLabelText('Merge Food'));
    const select = screen.getByLabelText('Merge Food into') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).not.toContain('food');
    expect(values).toContain('dining');
  });

  it('offers Delete on every category, built in or not', async () => {
    render(<Categories />);
    await waitFor(() => screen.getByLabelText('Name for Custom'));
    expect(screen.getByLabelText('Delete Food')).toBeDefined();
    expect(screen.getByLabelText('Delete Dining')).toBeDefined();
    expect(screen.getByLabelText('Delete Custom')).toBeDefined();
  });

  it('asks where transactions should move before deleting a category in use', async () => {
    installMoneyBridge({
      'categories:list': [
        { id: 'food', name: 'Food', parentId: null, isSystem: true, isHidden: false, mergedIntoId: null, usageCount: 12, childCount: 0, needsReassignment: true },
        { id: 'travel', name: 'Travel', parentId: null, isSystem: true, isHidden: false, mergedIntoId: null, usageCount: 0, childCount: 0, needsReassignment: false },
      ],
    });
    render(<Categories />);
    await waitFor(() => screen.getByLabelText('Name for Food'));
    fireEvent.click(screen.getByLabelText('Delete Food'));
    expect(screen.getByText(/12 transactions use Food/)).toBeDefined();
    expect(screen.getByLabelText('Move contents of Food to')).toBeDefined();
  });

  it('keeps Move and delete disabled until a destination is chosen', async () => {
    installMoneyBridge({
      'categories:list': [
        { id: 'food', name: 'Food', parentId: null, isSystem: true, isHidden: false, mergedIntoId: null, usageCount: 3, childCount: 0, needsReassignment: true },
        { id: 'travel', name: 'Travel', parentId: null, isSystem: true, isHidden: false, mergedIntoId: null, usageCount: 0, childCount: 0, needsReassignment: false },
      ],
    });
    render(<Categories />);
    await waitFor(() => screen.getByLabelText('Name for Food'));
    fireEvent.click(screen.getByLabelText('Delete Food'));
    const confirm = screen.getByRole('button', { name: 'Move and delete' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Move contents of Food to'), {
      target: { value: 'travel' },
    });
    expect((screen.getByRole('button', { name: 'Move and delete' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('mentions orphaned subcategories in the prompt', async () => {
    installMoneyBridge({
      'categories:list': [
        { id: 'food', name: 'Food', parentId: null, isSystem: true, isHidden: false, mergedIntoId: null, usageCount: 0, childCount: 2, needsReassignment: true },
        { id: 'travel', name: 'Travel', parentId: null, isSystem: true, isHidden: false, mergedIntoId: null, usageCount: 0, childCount: 0, needsReassignment: false },
      ],
    });
    render(<Categories />);
    await waitFor(() => screen.getByLabelText('Name for Food'));
    fireEvent.click(screen.getByLabelText('Delete Food'));
    expect(screen.getByText(/2 subcategories sit under it/)).toBeDefined();
  });

  it('shows Show for a hidden category and Hide for a visible one', async () => {
    render(<Categories />);
    await waitFor(() => screen.getByLabelText('Name for Custom'));
    expect(screen.getByText('Show')).toBeDefined();
    expect(screen.getAllByText('Hide').length).toBeGreaterThan(0);
  });
});

describe('Alerts screen editing', () => {
  const rules = [
    { id: 'r1', type: 'large_purchase', label: null, thresholdMinor: 20000, windowMinutes: null, enabled: true, isSystem: true },
    { id: 'r2', type: 'duplicate_charge', label: 'Dupes', thresholdMinor: null, windowMinutes: 1440, enabled: false, isSystem: false },
    { id: 'r3', type: 'new_recurring', label: null, thresholdMinor: null, windowMinutes: null, enabled: true, isSystem: false },
  ];

  beforeEach(() =>
    installMoneyBridge({
      'alerts:list': [],
      'alertRules:list': rules,
      'alertRules:update': { ok: true },
      'alertRules:create': { id: 'r4' },
      'alertRules:delete': { ok: true },
    }),
  );

  it('renders a threshold input for amount rules and a window input for duplicate rules', async () => {
    render(<Alerts />);
    await waitFor(() => screen.getByLabelText(/^Threshold for/));
    expect(screen.getByLabelText(/^Window for/)).toBeDefined();
  });

  it('shows the threshold in major units', async () => {
    render(<Alerts />);
    await waitFor(() =>
      expect((screen.getByLabelText(/^Threshold for/) as HTMLInputElement).value).toBe('200'),
    );
  });

  it('offers Delete only on user-created rules', async () => {
    render(<Alerts />);
    await waitFor(() => screen.getAllByText('Delete'));
    // r1 is a system rule; r2 and r3 are not.
    expect(screen.getAllByText('Delete')).toHaveLength(2);
  });

  it('shows no value input for a rule that needs none', async () => {
    render(<Alerts />);
    await waitFor(() => screen.getByText('+ New alert'));
    fireEvent.click(screen.getByText('+ New alert'));
    fireEvent.change(screen.getByLabelText('New alert type'), {
      target: { value: 'new_recurring' },
    });
    expect(screen.queryByLabelText('New alert value')).toBeNull();
  });

  it('saves an edited threshold on blur', async () => {
    render(<Alerts />);
    await waitFor(() => screen.getByLabelText(/^Threshold for/));
    const input = screen.getByLabelText(/^Threshold for/);
    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe('500');
  });
});

describe('Accounts and Alerts branches', () => {
  it('Alerts shows a user label when one is set', async () => {
    const { Alerts: A } = await import('@renderer/views/Alerts');
    installMoneyBridge({
      'alerts:list': [],
      'alertRules:list': [
        { id: 'r2', type: 'duplicate_charge', label: 'My dupes', thresholdMinor: null, windowMinutes: 60, enabled: true, isSystem: false },
      ],
    });
    render(<A />);
    await waitFor(() =>
      expect((screen.getByLabelText(/^Name for/) as HTMLInputElement).value).toBe('My dupes'),
    );
  });

  it('Alerts renders alert history with a dismissed entry', async () => {
    const { Alerts: A } = await import('@renderer/views/Alerts');
    installMoneyBridge({
      'alertRules:list': [],
      'alerts:list': [
        {
          id: 'a1',
          type: 'large_purchase',
          eventOccurredAt: '2026-08-29T10:00:00Z',
          detectedAt: '2026-08-29T10:01:00Z',
          dismissed: true,
        },
      ],
    });
    render(<A />);
    await waitFor(() => expect(screen.getByText('Aug 29')).toBeDefined());
    // A dismissed alert offers no further action.
    expect(screen.queryByText('Dismiss')).toBeNull();
  });

  it('Accounts shows the connect prompt while a link is in progress', async () => {
    const { Accounts: Acc } = await import('@renderer/views/Accounts');
    installMoneyBridge({ 'institutions:list': [] });
    render(<Acc />);
    await waitFor(() => screen.getByRole('button', { name: 'Connect an account' }));
    expect(screen.getByRole('button', { name: 'Connect an account' })).toBeDefined();
    expect(screen.getByText('Sync now')).toBeDefined();
  });
});

describe('Categories list behaviour', () => {
  const unsorted = [
    { id: 'z', name: 'Zebra', parentId: null, isSystem: false, isHidden: false, mergedIntoId: null, usageCount: 0, childCount: 0, needsReassignment: false },
    { id: 'a', name: 'Apple', parentId: null, isSystem: false, isHidden: false, mergedIntoId: null, usageCount: 0, childCount: 0, needsReassignment: false },
    { id: 'm', name: 'Mango', parentId: null, isSystem: false, isHidden: false, mergedIntoId: null, usageCount: 0, childCount: 0, needsReassignment: false },
  ];

  it('sorts categories alphabetically', async () => {
    installMoneyBridge({ 'categories:list': unsorted });
    render(<Categories />);
    await waitFor(() => screen.getByLabelText('Name for Apple'));
    const names = screen.getAllByLabelText(/^Name for /).map((i) => (i as HTMLInputElement).value);
    expect(names).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('offers a cancel on the merge picker', async () => {
    installMoneyBridge({ 'categories:list': unsorted });
    render(<Categories />);
    await waitFor(() => screen.getAllByText('Merge'));
    fireEvent.click(screen.getByLabelText('Merge Apple'));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByLabelText(/Merge .* into/)).toBeNull());
  });

  it('offers a cancel on the delete prompt', async () => {
    installMoneyBridge({
      'categories:list': [
        { ...unsorted[0]!, usageCount: 4, needsReassignment: true },
        unsorted[1]!,
      ],
    });
    render(<Categories />);
    await waitFor(() => screen.getByLabelText('Delete Zebra'));
    fireEvent.click(screen.getByLabelText('Delete Zebra'));
    expect(screen.getByLabelText(/Move contents of/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByLabelText(/Move contents of/)).toBeNull());
  });

  it('reverts a rename on Escape', async () => {
    installMoneyBridge({ 'categories:list': unsorted });
    render(<Categories />);
    await waitFor(() => screen.getByLabelText('Name for Apple'));
    const input = screen.getByLabelText('Name for Apple') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Banana' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('Apple');
  });

  it('sorts merge destinations alphabetically and excludes itself', async () => {
    installMoneyBridge({ 'categories:list': unsorted });
    render(<Categories />);
    await waitFor(() => screen.getAllByText('Merge'));
    fireEvent.click(screen.getByLabelText('Merge Apple'));
    const select = screen.getByLabelText('Merge Apple into') as HTMLSelectElement;
    const options = Array.from(select.options).slice(1).map((o) => o.text);
    expect(options).toEqual(['Mango', 'Zebra']);
  });
});
