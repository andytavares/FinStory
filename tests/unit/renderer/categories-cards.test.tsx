// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { Categories } from '@renderer/views/Categories';

afterEach(cleanup);

const row = (over: Record<string, unknown>) => ({
  id: 'x', name: 'X', parentId: null, isSystem: true, isHidden: false, mergedIntoId: null,
  usageCount: 0, childCount: 0, needsReassignment: false, spentMinor: 0, rolledUpSpentMinor: 0, ...over,
});

const CATS = [
  row({ id: 'food', name: 'Food', childCount: 1, spentMinor: 0, rolledUpSpentMinor: 61240 }),
  row({ id: 'dining', name: 'Dining', parentId: 'food', spentMinor: 17236, rolledUpSpentMinor: 17236 }),
  row({ id: 'apple', name: 'Apple', isSystem: false, isHidden: true }),
];

function setup(list: unknown[] = CATS): ReturnType<typeof vi.fn> {
  const invoke = vi.fn((channel: string) =>
    channel === 'categories:list' ? Promise.resolve(list) : Promise.resolve({ ok: true }),
  );
  Object.defineProperty(globalThis.window, 'money', {
    configurable: true,
    value: { invoke, on: () => () => {} },
  });
  return invoke;
}

async function openMenu(name: string): Promise<void> {
  await waitFor(() => screen.getByLabelText(`Actions for ${name}`));
  fireEvent.click(screen.getByLabelText(`Actions for ${name}`));
}

describe('Categories as group cards', () => {
  it('counts groups and subcategories in the header', async () => {
    setup();
    render(<Categories />);
    await waitFor(() => screen.getByText('2 groups · 1 subcategories'));
  });

  it('shows the group spend rolled up and the subcategory spend', async () => {
    setup();
    render(<Categories />);
    await waitFor(() => screen.getByText('$612.40'));
    expect(screen.getByText('$172.36')).toBeDefined();
    expect(screen.getByText('Built in · 1 subcategories')).toBeDefined();
    expect(screen.getByText('Custom · 0 subcategories')).toBeDefined();
  });

  it('orders groups alphabetically', async () => {
    setup();
    render(<Categories />);
    await waitFor(() => screen.getByLabelText('Actions for Apple'));
    const labels = screen.getAllByLabelText(/^Actions for (Apple|Food)$/).map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual(['Actions for Apple', 'Actions for Food']);
  });

  it('keeps the actions inside the menu until it is opened', async () => {
    setup();
    render(<Categories />);
    await waitFor(() => screen.getByLabelText('Actions for Food'));
    expect(screen.queryByLabelText('Delete Food')).toBeNull();
    await openMenu('Food');
    expect(screen.getByLabelText('Delete Food')).toBeDefined();
  });

  it('Hide calls setHidden, and a hidden category offers Show', async () => {
    const invoke = setup();
    render(<Categories />);
    await openMenu('Food');
    fireEvent.click(screen.getByText('Hide'));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('categories:setHidden', { id: 'food', hidden: true }),
    );
    await openMenu('Apple');
    expect(screen.getByText('Show')).toBeDefined();
  });

  it('Merge lists every other category, sorted, and calls merge', async () => {
    const invoke = setup();
    render(<Categories />);
    await openMenu('Food');
    fireEvent.click(screen.getByLabelText('Merge Food'));
    const select = screen.getByLabelText('Merge Food into') as HTMLSelectElement;
    expect(Array.from(select.options).slice(1).map((o) => o.text)).toEqual(['Apple', 'Dining']);
    fireEvent.change(select, { target: { value: 'apple' } });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('categories:merge', { sourceId: 'food', targetId: 'apple' }),
    );
  });

  it('Delete on an unused category deletes it directly', async () => {
    const invoke = setup();
    render(<Categories />);
    await openMenu('Apple');
    fireEvent.click(screen.getByLabelText('Delete Apple'));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('categories:delete', { id: 'apple' }));
  });

  it('Delete on a category in use asks where it goes, then reassigns', async () => {
    const invoke = setup([
      row({ id: 'food', name: 'Food', usageCount: 12, childCount: 2, needsReassignment: true }),
      row({ id: 'travel', name: 'Travel' }),
    ]);
    render(<Categories />);
    await openMenu('Food');
    fireEvent.click(screen.getByLabelText('Delete Food'));
    expect(screen.getByText(/12 transactions use Food/)).toBeDefined();
    expect(screen.getByText(/2 subcategories sit under it/)).toBeDefined();
    const move = screen.getByRole('button', { name: 'Move and delete' }) as HTMLButtonElement;
    expect(move.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Move contents of Food to'), { target: { value: 'travel' } });
    fireEvent.click(move);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('categories:delete', { id: 'food', reassignToId: 'travel' }),
    );
  });

  it('Rename swaps the name for an input and saves on Enter', async () => {
    const invoke = setup();
    render(<Categories />);
    await openMenu('Food');
    fireEvent.click(screen.getByText('Rename'));
    const input = screen.getByLabelText('Name for Food');
    fireEvent.change(input, { target: { value: 'Eating' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('categories:rename', { id: 'food', name: 'Eating' }),
    );
  });

  it('Escape in the rename input keeps the old name and saves nothing', async () => {
    const invoke = setup();
    render(<Categories />);
    await openMenu('Food');
    fireEvent.click(screen.getByText('Rename'));
    const input = screen.getByLabelText('Name for Food');
    fireEvent.change(input, { target: { value: 'Eating' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByLabelText('Name for Food')).toBeNull();
    expect(invoke.mock.calls.some(([c]) => c === 'categories:rename')).toBe(false);
  });

  it('+ New category opens an inline create that adds a top-level category', async () => {
    const invoke = setup();
    render(<Categories />);
    await waitFor(() => screen.getByText('+ New category'));
    fireEvent.click(screen.getByText('+ New category'));
    const input = screen.getByLabelText('New top-level category');
    fireEvent.change(input, { target: { value: 'Pets' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('categories:create', { name: 'Pets', parentId: null }),
    );
  });

  it('+ Subcategory creates under its parent and Escape cancels', async () => {
    const invoke = setup();
    render(<Categories />);
    await waitFor(() => screen.getByLabelText('Add a subcategory under Food'));
    const food = screen.getByLabelText('Add a subcategory under Food');
    expect(food.textContent).toBe('+ Subcategory');
    fireEvent.click(food);
    const input = screen.getByLabelText('New subcategory under Food');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByLabelText('New subcategory under Food')).toBeNull();
    fireEvent.click(screen.getByLabelText('Add a subcategory under Food'));
    fireEvent.change(screen.getByLabelText('New subcategory under Food'), { target: { value: 'Takeout' } });
    fireEvent.keyDown(screen.getByLabelText('New subcategory under Food'), { key: 'Enter' });
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('categories:create', { name: 'Takeout', parentId: 'food' }),
    );
  });
});
