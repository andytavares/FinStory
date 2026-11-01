// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Recurring } from '@renderer/views/Recurring';
import { Income } from '@renderer/views/Income';
import { Alerts } from '@renderer/views/Alerts';
import { installMoneyBridge } from './setup';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function charge(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'r1',
    merchantKey: 'gym',
    merchantName: 'Gym',
    currentAmountMinor: -4500,
    cadence: 'monthly',
    firstSeenDate: '2026-01-01',
    cumulativePaidMinor: -36000,
    status: 'active',
    nextExpectedDate: '2026-09-16',
    monthlyCostMinor: 4500,
    yearlyCostMinor: 54000,
    amountChanges: [],
    ...overrides,
  };
}

function recurring(list: unknown[]): void {
  installMoneyBridge({ 'recurring:list': list, 'recurring:candidates': [] });
  render(<Recurring onOpenMerchant={() => {}} />);
}

describe('Recurring', () => {
  it('shows the monthly and yearly total of active charges in the header', async () => {
    recurring([
      charge({}),
      charge({ id: 'r2', merchantName: 'Old gym', status: 'inactive', monthlyCostMinor: 9900, yearlyCostMinor: 99000 }),
    ]);
    await waitFor(() => expect(screen.getByText('$45.00 a month · $540.00 a year')).toBeDefined());
  });

  it('lists stopped charges only on the Stopped tab', async () => {
    recurring([charge({}), charge({ id: 'r2', merchantName: 'Old gym', status: 'inactive' })]);
    await waitFor(() => screen.getByText('Gym'));
    expect(screen.queryByText('Old gym')).toBeNull();
    fireEvent.click(screen.getByText('Stopped'));
    expect(screen.getByText('Old gym')).toBeDefined();
    expect(screen.queryByText('Gym')).toBeNull();
  });

  it('shows the price-rise chip only when the price went up', async () => {
    recurring([
      charge({
        merchantName: 'Netflix',
        currentAmountMinor: -1599,
        amountChanges: [{ oldAmountMinor: -1299, newAmountMinor: -1599, changedAt: '2026-06-10T00:00:00Z' }],
      }),
      charge({
        id: 'r2',
        merchantName: 'Spotify',
        currentAmountMinor: -999,
        amountChanges: [{ oldAmountMinor: -1099, newAmountMinor: -999, changedAt: '2026-06-10T00:00:00Z' }],
      }),
    ]);
    await waitFor(() => screen.getByText('Spotify'));
    expect(screen.getAllByText(/↑ Was/)).toHaveLength(1);
    expect(screen.getByText('↑ Was $12.99 until Jun')).toBeDefined();
  });

  it('places an upcoming charge on the timeline by its date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-01T12:00:00Z'));
    recurring([charge({ nextExpectedDate: '2026-09-16' }), charge({ id: 'r2', merchantName: 'Later', nextExpectedDate: '2026-12-01' })]);
    const timeline = await screen.findByTestId('timeline');
    const placed = Array.from(timeline.querySelectorAll<HTMLElement>('[style*="left: 50%"]'));
    expect(placed.some((el) => el.textContent?.includes('$45.00'))).toBe(true);
    expect(timeline.textContent).not.toContain('Later');
  });
});

describe('Income', () => {
  const SOURCE = {
    id: 'i1',
    merchantKey: 'acme',
    merchantName: 'Acme Payroll',
    expectedAmountMinor: 310000,
    cadence: 'biweekly',
    nextExpectedDate: '2026-11-12T00:00:00Z',
    daysUntilNext: 11,
    detectionConfidence: 1,
    isUserConfirmed: false,
  };
  const HISTORY = [
    { month: '2026-09', incomeMinor: 620000, spendingMinor: 250000 },
    { month: '2026-10', incomeMinor: 620000, spendingMinor: 443000 },
  ];

  function income(): void {
    installMoneyBridge({ 'income:list': [SOURCE], 'income:history': HISTORY, 'institutions:list': [] });
    render(<Income onOpenMerchant={() => {}} />);
  }

  it('shows the next deposit and the deposits-vs-spending chart', async () => {
    income();
    await waitFor(() => screen.getByText('Deposits vs spending'));
    expect(screen.getByText('Thu, Nov 12 · in 11 days')).toBeDefined();
    expect(screen.getByText('Detected · 100%')).toBeDefined();
    expect(screen.getByText('Spending')).toBeDefined();
  });

  it('opens the Add income form below the header, not inside it', async () => {
    income();
    await waitFor(() => screen.getAllByText('Add income'));
    fireEvent.click(screen.getAllByText('Add income')[0] as HTMLElement);
    const form = screen.getByText('Income the detector cannot see');
    const header = document.querySelector('.ds-page-head') as HTMLElement;
    expect(header.contains(form)).toBe(false);
    expect(header.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Alerts', () => {
  const RULES = [
    { id: 'r1', type: 'large_purchase', label: null, thresholdMinor: 20000, windowMinutes: null, enabled: true, isSystem: true },
  ];
  const ALERT = {
    id: 'a1',
    type: 'large_purchase',
    eventOccurredAt: '2026-10-29T10:00:00Z',
    detectedAt: '2026-10-29T10:01:00Z',
    dismissed: false,
    transactionId: 't9',
    merchantName: 'Apple Store',
    amountMinor: -45_000,
  };

  function alerts(onOpenMerchant: (name: string) => void = () => {}): ReturnType<typeof vi.fn> {
    const invoke = vi.fn((channel: string) =>
      Promise.resolve(
        channel === 'alerts:list' ? [ALERT] : channel === 'alertRules:list' ? RULES : { ok: true },
      ),
    );
    Object.defineProperty(globalThis.window, 'money', {
      configurable: true,
      value: { invoke, on: () => () => {} },
    });
    render(<Alerts onOpenMerchant={onOpenMerchant} />);
    return invoke;
  }

  it('turning a rule off calls update with enabled false', async () => {
    const invoke = alerts();
    const toggle = await screen.findByRole('switch');
    fireEvent.click(toggle);
    expect(invoke).toHaveBeenCalledWith('alertRules:update', { id: 'r1', enabled: false });
  });

  it('says which charge raised the alert and opens its merchant', async () => {
    const onOpenMerchant = vi.fn();
    alerts(onOpenMerchant);
    expect(await screen.findByText(/Apple Store charged \$450\.00 · Oct 29/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onOpenMerchant).toHaveBeenCalledWith('Apple Store');
  });

  it('removes an alert from the list once it is dismissed', async () => {
    let dismissed = false;
    const invoke = vi.fn((channel: string) => {
      if (channel === 'alerts:dismiss') dismissed = true;
      if (channel === 'alerts:list') {
        return Promise.resolve([
          { ...ALERT, dismissed },
          { ...ALERT, id: 'a0', merchantName: 'Old Gym', dismissed: true },
        ]);
      }
      return Promise.resolve(channel === 'alertRules:list' ? RULES : { ok: true });
    });
    Object.defineProperty(globalThis.window, 'money', { configurable: true, value: { invoke, on: () => () => {} } });
    render(<Alerts onOpenMerchant={() => {}} />);

    expect(await screen.findByText(/Apple Store charged/)).toBeDefined();
    expect(screen.queryByText(/Old Gym/)).toBeNull();
    fireEvent.click(screen.getByText('Dismiss'));
    await waitFor(() => expect(screen.queryByText(/Apple Store charged/)).toBeNull());
    expect(screen.getByText('Nothing has needed your attention')).toBeDefined();
  });

  it('dismissing an alert calls dismiss for that alert', async () => {
    const invoke = alerts();
    fireEvent.click(await screen.findByText('Dismiss'));
    expect(invoke).toHaveBeenCalledWith('alerts:dismiss', { alertId: 'a1' });
  });
});
