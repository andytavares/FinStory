// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { Register } from '@renderer/views/Register';
import { installMoneyBridge } from './setup';

afterEach(cleanup);

function tx(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    amountMinor: -1599,
    merchantName: 'Streamly',
    merchantKey: 'streamly',
    isRecurring: false,
    description: 'STREAMLY.COM',
    postedDate: '2026-08-04',
    categoryId: 'streaming',
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

function bridge(rows: unknown[]) {
  return {
    'categories:list': [
      { id: 'streaming', name: 'Streaming', parentId: null, isHidden: false, mergedIntoId: null },
    ],
    'transactions:query': {
      rows,
      totalCount: rows.length,
      excludedCount: 0,
      dataComplete: true,
      staleInstitutions: [],
    },
  };
}

describe('the recurring chip', () => {
  it('marks a recurring transaction in the register', async () => {
    installMoneyBridge(bridge([tx({ isRecurring: true })]));
    render(<Register initialCategoryId={null} />);
    await waitFor(() => expect(screen.getByText('Recurring')).toBeDefined());
  });

  it('stays off a one-off', async () => {
    installMoneyBridge(bridge([tx()]));
    render(<Register initialCategoryId={null} />);
    await waitFor(() => screen.getByText('Streamly'));
    expect(screen.queryByText('Recurring')).toBeNull();
  });

  it('marks only the recurring rows in a mixed list', async () => {
    installMoneyBridge(
      bridge([
        tx({ id: 'a', isRecurring: true }),
        tx({ id: 'b', isRecurring: false, merchantName: 'Corner Shop' }),
        tx({ id: 'c', isRecurring: true, merchantName: 'Gym' }),
      ]),
    );
    render(<Register initialCategoryId={null} />);
    await waitFor(() => expect(screen.getAllByText('Recurring')).toHaveLength(2));
  });

  it('says what it means rather than relying on the icon alone', async () => {
    installMoneyBridge(bridge([tx({ isRecurring: true })]));
    render(<Register initialCategoryId={null} />);
    await waitFor(() => screen.getByText('Recurring'));
    expect(screen.getByTitle('Part of a recurring charge')).toBeDefined();
  });
});
