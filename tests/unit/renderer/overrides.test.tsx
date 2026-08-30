// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Overrides } from '@renderer/views/Overrides';
import { installMoneyBridge } from './setup';

afterEach(cleanup);

const RECORDS = [
  {
    id: 'merchant_name:uber eats',
    kind: 'merchant_name',
    target: 'uber eats',
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

describe('the overrides page', () => {
  it('says so when the user has overridden nothing', async () => {
    installMoneyBridge({ 'overrides:list': [] });
    render(<Overrides />);
    await waitFor(() =>
      expect(screen.getByText('You have not overridden anything yet')).toBeDefined(),
    );
  });

  it('groups overrides by what they are', async () => {
    installMoneyBridge({ 'overrides:list': RECORDS });
    render(<Overrides />);
    await waitFor(() => expect(screen.getByText('Merchant renames')).toBeDefined());
    expect(screen.getByText('Excluded from totals')).toBeDefined();
  });

  it('shows what the override replaced', async () => {
    installMoneyBridge({ 'overrides:list': RECORDS });
    render(<Overrides />);
    await waitFor(() =>
      expect(screen.getByText('Uber Eats → Dinner delivery')).toBeDefined(),
    );
  });

  it('shows how many transactions each override reaches', async () => {
    installMoneyBridge({ 'overrides:list': RECORDS });
    render(<Overrides />);
    await waitFor(() => expect(screen.getByText(/14 transactions/)).toBeDefined());
    expect(screen.getByText(/1 transaction ·/)).toBeDefined();
  });

  it('counts them', async () => {
    installMoneyBridge({ 'overrides:list': RECORDS });
    render(<Overrides />);
    await waitFor(() => expect(screen.getByText('2 overrides')).toBeDefined());
  });

  it('undoes one through the clear channel', async () => {
    const invoke = vi.fn((channel: string) =>
      channel === 'overrides:list' ? Promise.resolve(RECORDS) : Promise.resolve({ ok: true }),
    );
    Object.defineProperty(globalThis.window, 'money', {
      configurable: true,
      value: { invoke, on: () => () => {} },
    });
    render(<Overrides />);
    await waitFor(() => screen.getByLabelText('Undo override for Dinner delivery'));
    fireEvent.click(screen.getByLabelText('Undo override for Dinner delivery'));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('overrides:clear', {
        kind: 'merchant_name',
        target: 'uber eats',
      }),
    );
  });
});
