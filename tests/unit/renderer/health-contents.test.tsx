// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { Health } from '@renderer/views/Health';
import { installMoneyBridge } from './setup';

afterEach(cleanup);

function health(contents: Record<string, number>) {
  return {
    'health:get': {
      perAccount: [],
      contents: {
        institutions: 1,
        accounts: 2,
        everydayAccounts: 2,
        transactions: 0,
        transactionsInEverydayAccounts: 0,
        transactionsThisMonth: 0,
        categorized: 0,
        uncategorizable: 0,
        ...contents,
      },
      metrics: {
        syncDurationMsP50: null,
        transactionsProcessed: 0,
        localResolutionRate: null,
        droppedDiagnosticEvents: 0,
      },
    },
  };
}

/** An empty screen must be explainable, not mysterious. */
describe('the health view says why the app looks empty', () => {
  it('says nothing was imported when there are no transactions', async () => {
    installMoneyBridge(health({}));
    render(<Health />);
    await waitFor(() =>
      expect(screen.getByText(/Nothing has been imported yet/)).toBeDefined(),
    );
  });

  it('says so when everything sits outside day-to-day accounts', async () => {
    installMoneyBridge(health({ transactions: 500, transactionsInEverydayAccounts: 0 }));
    render(<Health />);
    await waitFor(() =>
      expect(screen.getByText(/not marked day-to-day/)).toBeDefined(),
    );
  });

  it('explains nothing when the data is there', async () => {
    installMoneyBridge(
      health({ transactions: 500, transactionsInEverydayAccounts: 480, transactionsThisMonth: 40 }),
    );
    render(<Health />);
    await waitFor(() => expect(screen.getByText('Transactions imported')).toBeDefined());
    expect(screen.queryByText(/Nothing has been imported yet/)).toBeNull();
    expect(screen.queryByText(/not marked day-to-day/)).toBeNull();
  });

  it('shows the counts themselves', async () => {
    installMoneyBridge(health({ transactions: 500, transactionsInEverydayAccounts: 480 }));
    render(<Health />);
    await waitFor(() => expect(screen.getByText('500')).toBeDefined());
    expect(screen.getByText('480')).toBeDefined();
  });
});
