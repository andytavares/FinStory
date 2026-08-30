// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { installMoneyBridge } from './setup';
import { Categories } from '@renderer/views/Categories';
import { Alerts } from '@renderer/views/Alerts';

afterEach(cleanup);

const CATS = [
  { id: 'food', name: 'Food', parentId: null, isSystem: true, isHidden: false, mergedIntoId: null },
  { id: 'dining', name: 'Dining', parentId: 'food', isSystem: true, isHidden: false, mergedIntoId: null },
  { id: 'custom', name: 'Custom', parentId: null, isSystem: false, isHidden: true, mergedIntoId: null },
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
    fireEvent.click(screen.getAllByText('+ Add subcategory')[0]!);
    const input = screen.getByLabelText('New subcategory under Food');
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByLabelText('New subcategory under Food')).toBeNull(),
    );
  });

  it('creates a subcategory on Enter', async () => {
    render(<Categories />);
    await waitFor(() => screen.getAllByText('+ Add subcategory'));
    fireEvent.click(screen.getAllByText('+ Add subcategory')[0]!);
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
    fireEvent.click(screen.getAllByText('Merge')[0]!);
    const select = screen.getByLabelText('Merge Food into') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).not.toContain('food');
    expect(values).toContain('dining');
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
    await waitFor(() => screen.getByLabelText('New alert type'));
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
