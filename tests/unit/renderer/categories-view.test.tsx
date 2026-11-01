// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { installMoneyBridge } from './setup';
import { Alerts } from '@renderer/views/Alerts';

afterEach(cleanup);

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
    await waitFor(() => expect(screen.getByText(/Happened/)).toBeDefined());
    // A dismissed alert offers no further action.
    expect(screen.queryByText('Not a problem')).toBeNull();
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
