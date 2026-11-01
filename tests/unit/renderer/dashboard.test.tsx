// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { installMoneyBridge } from './setup';
import { Dashboard } from '@renderer/views/Dashboard';

afterEach(cleanup);

const BASE = {
  balances: [],
  cashFlowMinor: { incomeMinor: 0, spendingMinor: -1500, netMinor: -1500 },
  categoryBreakdown: { rows: [], totalMinor: 0, dataComplete: true, staleInstitutions: [] },
  whatChanged: [],
  dataComplete: true,
  staleInstitutions: [] as string[],
  runway: {
    available: false,
    currentBalanceMinor: 0,
    projectedMinor: null,
    floorMinor: 100000,
    nextIncomeDate: null,
    reason: 'Add an income source so Money can project to payday.',
  },
  kpis: {
    spent: { currentMinor: 1500, seriesMinor: [189000, 187400, 1500] },
    income: { currentMinor: 0, seriesMinor: [310000, 0], nextDeposit: null },
    recurring: { monthlyMinor: 182698, count: 3, candidateCount: 2, seriesMinor: [181000, 182698] },
    safeToSpendPerDayMinor: 3780,
  },
  upcomingRecurring: [
    { merchantName: 'Spotify', date: '2026-11-19', amountMinor: 1099 },
    { merchantName: 'Landlord', date: '2026-11-30', amountMinor: 180000 },
  ],
  runwaySeries: null,
  whereItWent: [{ groupId: 'food', name: 'Food', spentMinor: 61240 }],
};

describe('Dashboard (redesign)', () => {
  it('shows the four KPI tiles with their values', async () => {
    installMoneyBridge({ 'dashboard:get': BASE });
    render(<Dashboard onDrill={() => {}} />);
    await waitFor(() => screen.getByText('Spent this month'));
    expect(screen.getByText('$15.00')).toBeDefined();
    expect(screen.getByText('Income this month')).toBeDefined();
    expect(screen.getByText('$1,826.98')).toBeDefined();
    expect(screen.getByText('Recurring / month')).toBeDefined();
    expect(screen.getByText('$37.80')).toBeDefined();
    expect(screen.getByText('Safe to spend / day')).toBeDefined();
  });

  it('lists the upcoming recurring charges', async () => {
    installMoneyBridge({ 'dashboard:get': BASE });
    render(<Dashboard onDrill={() => {}} />);
    await waitFor(() => screen.getByText('Coming up'));
    expect(screen.getByText('Spotify')).toBeDefined();
    expect(screen.getByText('$1,800.00')).toBeDefined();
  });

  it('says why there is no runway when there is no payday', async () => {
    installMoneyBridge({ 'dashboard:get': BASE });
    render(<Dashboard onDrill={() => {}} />);
    await waitFor(() => screen.getByText(/Add an income source/));
  });

  it('shows the reconnect chip only when an institution needs sign-in', async () => {
    installMoneyBridge({ 'dashboard:get': BASE });
    const { unmount } = render(<Dashboard onDrill={() => {}} />);
    await waitFor(() => screen.getByText('Coming up'));
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
    unmount();

    installMoneyBridge({
      'dashboard:get': { ...BASE, dataComplete: false, staleInstitutions: ['Amex'] },
    });
    let reconnected = false;
    render(<Dashboard onDrill={() => {}} onReconnect={() => (reconnected = true)} />);
    await waitFor(() => screen.getByRole('button', { name: 'Reconnect' }));
    expect(screen.getByText(/Amex/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(reconnected).toBe(true);
  });

  it('asks for the chosen period and relabels the tiles', async () => {
    const invoke = vi.fn((channel: string) => Promise.resolve(channel === 'dashboard:get' ? BASE : null));
    Object.defineProperty(globalThis.window, 'money', { configurable: true, value: { invoke, on: () => () => {} } });
    render(<Dashboard onDrill={() => {}} />);
    await waitFor(() => screen.getByText('Spent this month'));
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    await waitFor(() => screen.getByText('Spent this week'));
    expect(screen.getByText('Income this week')).toBeDefined();
    expect(screen.getByText('Last 7 days')).toBeDefined();
    expect(invoke).toHaveBeenCalledWith('dashboard:get', expect.objectContaining({ period: 'week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Year' }));
    await waitFor(() => screen.getByText('Spent this year'));
    expect(screen.getByText('Last 365 days')).toBeDefined();
  });
});
