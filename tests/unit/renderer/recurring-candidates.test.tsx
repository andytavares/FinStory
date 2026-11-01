// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { RecurringCandidates } from '@renderer/views/RecurringCandidates';
import { Recurring } from '@renderer/views/Recurring';
import { installMoneyBridge } from './setup';

afterEach(cleanup);

const CANDIDATE = {
  key: 'streamly:-1599',
  merchantKey: 'streamly',
  merchantName: 'Streamly',
  amountMinor: -1599,
  cadence: 'monthly',
  occurrences: 3,
  firstSeen: '2026-06-04T12:00:00Z',
  lastSeen: '2026-08-04T12:00:00Z',
  nextExpected: '2026-09-03T12:00:00Z',
  confidence: 0.85,
  totalPaidMinor: -4797,
  transactionIds: ['a', 'b', 'c'],
};

describe('the possible recurring charges page', () => {
  it('says nothing is waiting when everything is answered', async () => {
    installMoneyBridge({ 'recurring:candidates': [] });
    render(<RecurringCandidates onOpenMerchant={() => {}} onDecided={() => {}} />);
    await waitFor(() => expect(screen.getByText('Nothing waiting on you')).toBeDefined());
  });

  it('shows the payee, cadence and how many times it was seen', async () => {
    installMoneyBridge({ 'recurring:candidates': [CANDIDATE] });
    render(<RecurringCandidates onOpenMerchant={() => {}} onDecided={() => {}} />);
    await waitFor(() => expect(screen.getByText('Streamly')).toBeDefined());
    expect(screen.getByText(/Seen 3 times/)).toBeDefined();
  });

  it('says when the next one is expected and how confident it is', async () => {
    installMoneyBridge({ 'recurring:candidates': [CANDIDATE] });
    render(<RecurringCandidates onOpenMerchant={() => {}} onDecided={() => {}} />);
    await waitFor(() => expect(screen.getByText(/85% confident/)).toBeDefined());
  });

  it('confirms a charge as recurring', async () => {
    const invoke = vi.fn((channel: string) =>
      channel === 'recurring:candidates'
        ? Promise.resolve([CANDIDATE])
        : Promise.resolve({ marked: 3 }),
    );
    Object.defineProperty(globalThis.window, 'money', {
      configurable: true,
      value: { invoke, on: () => () => {} },
    });
    render(<RecurringCandidates onOpenMerchant={() => {}} onDecided={() => {}} />);
    await waitFor(() => screen.getByLabelText('Mark Streamly recurring'));
    fireEvent.click(screen.getByLabelText('Mark Streamly recurring'));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('recurring:decide', {
        merchantKey: 'streamly',
        amountMinor: -1599,
        decision: 'recurring',
        cadence: 'monthly',
      }),
    );
  });

  it('says how many transactions the answer reached', async () => {
    installMoneyBridge({
      'recurring:candidates': [CANDIDATE],
      'recurring:decide': { marked: 3 },
    });
    render(<RecurringCandidates onOpenMerchant={() => {}} onDecided={() => {}} />);
    await waitFor(() => screen.getByLabelText('Mark Streamly recurring'));
    fireEvent.click(screen.getByLabelText('Mark Streamly recurring'));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('across 3 transactions'),
    );
  });

  it('dismisses a charge as not recurring', async () => {
    const invoke = vi.fn((channel: string) =>
      channel === 'recurring:candidates'
        ? Promise.resolve([CANDIDATE])
        : Promise.resolve({ marked: 3 }),
    );
    Object.defineProperty(globalThis.window, 'money', {
      configurable: true,
      value: { invoke, on: () => () => {} },
    });
    render(<RecurringCandidates onOpenMerchant={() => {}} onDecided={() => {}} />);
    await waitFor(() => screen.getByLabelText('Mark Streamly not recurring'));
    fireEvent.click(screen.getByLabelText('Mark Streamly not recurring'));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('recurring:decide', {
        merchantKey: 'streamly',
        amountMinor: -1599,
        decision: 'not_recurring',
        cadence: 'monthly',
      }),
    );
  });

  it('tells the parent to refresh after an answer', async () => {
    const onDecided = vi.fn();
    installMoneyBridge({
      'recurring:candidates': [CANDIDATE],
      'recurring:decide': { marked: 3 },
    });
    render(<RecurringCandidates onOpenMerchant={() => {}} onDecided={onDecided} />);
    await waitFor(() => screen.getByLabelText('Mark Streamly recurring'));
    fireEvent.click(screen.getByLabelText('Mark Streamly recurring'));
    await waitFor(() => expect(onDecided).toHaveBeenCalled());
  });

  it('opens the transactions behind a candidate', async () => {
    const onOpenMerchant = vi.fn();
    installMoneyBridge({ 'recurring:candidates': [CANDIDATE] });
    render(<RecurringCandidates onOpenMerchant={onOpenMerchant} onDecided={() => {}} />);
    await waitFor(() => screen.getByText('See transactions'));
    fireEvent.click(screen.getByText('See transactions'));
    expect(onOpenMerchant).toHaveBeenCalledWith('streamly');
  });

  it('spells out that an answer covers every instance', async () => {
    installMoneyBridge({ 'recurring:candidates': [CANDIDATE] });
    render(<RecurringCandidates onOpenMerchant={() => {}} onDecided={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText(/applies to every instance of that charge/)).toBeDefined(),
    );
  });
});

describe('the Recurring page tabs', () => {
  const LEDGER = [
    {
      id: 'r1',
      merchantKey: 'gym',
      merchantName: 'Gym',
      currentAmountMinor: -4500,
      cadence: 'monthly',
      firstSeenDate: '2026-01-01',
      lastSeenDate: '2026-08-01',
      cumulativePaidMinor: -36000,
      status: 'active',
      userAcknowledged: true,
      nextExpectedDate: '2026-09-01',
      monthlyCostMinor: 4500,
      yearlyCostMinor: 54000,
      amountChanges: [],
    },
  ];

  it('shows how many charges are waiting on an answer', async () => {
    installMoneyBridge({ 'recurring:list': LEDGER, 'recurring:candidates': [CANDIDATE] });
    render(<Recurring onOpenMerchant={() => {}} />);
    await waitFor(() => expect(screen.getByText('Possible · 1')).toBeDefined());
  });

  it('opens on the confirmed ledger', async () => {
    installMoneyBridge({ 'recurring:list': LEDGER, 'recurring:candidates': [CANDIDATE] });
    render(<Recurring onOpenMerchant={() => {}} />);
    await waitFor(() => expect(screen.getByText('Gym')).toBeDefined());
    expect(screen.queryByText('Streamly')).toBeNull();
  });

  it('switches to the suggestions', async () => {
    installMoneyBridge({ 'recurring:list': LEDGER, 'recurring:candidates': [CANDIDATE] });
    render(<Recurring onOpenMerchant={() => {}} />);
    await waitFor(() => screen.getByText('Possible · 1'));
    fireEvent.click(screen.getByText('Possible · 1'));
    await waitFor(() => expect(screen.getByText('Streamly')).toBeDefined());
  });

  it('drops the count when nothing is waiting', async () => {
    installMoneyBridge({ 'recurring:list': LEDGER, 'recurring:candidates': [] });
    render(<Recurring onOpenMerchant={() => {}} />);
    await waitFor(() => expect(screen.getByText('Possible · 0')).toBeDefined());
  });
})
