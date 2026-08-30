// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { Review } from '@renderer/views/Review';
import { installMoneyBridge } from './setup';

afterEach(cleanup);

function reviewRow(overrides: Record<string, unknown>) {
  return {
    rows: [
      {
        transaction: {
          id: 't1',
          amountMinor: -1850,
          description: 'UBER *EATS 8829 SAN FRANCISCO',
          merchantName: 'Uber Eats',
          userMerchantName: null,
          merchantKey: 'uber eats',
          postedDate: '2026-08-20',
          categoryId: 'dining',
          confidence: 0.4,
          needsReview: true,
          isInternalTransfer: false,
          userNote: null,
          userExcluded: false,
          userRecurringOverride: null,
          ...overrides,
        },
        guessCategoryId: 'dining',
        confidence: 0.4,
        reasoning: 'Food delivery',
      },
    ],
    total: 1,
  };
}

/**
 * The review queue rendered `transaction.description` directly, so a renamed
 * merchant still showed the raw bank descriptor there while the register showed
 * the new name.
 */
describe('the review queue honours the name override', () => {
  it('shows the user override, never the bank descriptor', async () => {
    installMoneyBridge({
      'review:queue': reviewRow({ userMerchantName: 'Dinner delivery' }),
      'categories:list': [],
    });
    render(<Review />);
    await waitFor(() => expect(screen.getByText('Dinner delivery')).toBeDefined());
    expect(screen.queryByText('UBER *EATS 8829 SAN FRANCISCO')).toBeNull();
  });

  it('shows the merchant name when the user has set no override', async () => {
    installMoneyBridge({ 'review:queue': reviewRow({}), 'categories:list': [] });
    render(<Review />);
    await waitFor(() => expect(screen.getByText('Uber Eats')).toBeDefined());
  });

  it('falls back to the descriptor only when there is no name at all', async () => {
    installMoneyBridge({
      'review:queue': reviewRow({ merchantName: null }),
      'categories:list': [],
    });
    render(<Review />);
    await waitFor(() =>
      expect(screen.getByText('UBER *EATS 8829 SAN FRANCISCO')).toBeDefined(),
    );
  });

  it('uses the override in the accessible labels too', async () => {
    installMoneyBridge({
      'review:queue': reviewRow({ userMerchantName: 'Dinner delivery' }),
      'categories:list': [],
    });
    render(<Review />);
    await waitFor(() => expect(screen.getByLabelText('Select Dinner delivery')).toBeDefined());
    expect(screen.getByLabelText('Edit Dinner delivery')).toBeDefined();
  });
});

describe('the review queue explains why nothing is categorized', () => {
  it('says so when no model is configured', async () => {
    installMoneyBridge({
      'review:queue': reviewRow({}),
      'categories:list': [],
      'model:status': { localOnly: true, reason: 'No Anthropic API key set.' },
    });
    render(<Review />);
    await waitFor(() =>
      expect(screen.getByText(/No Anthropic API key set/)).toBeDefined(),
    );
  });

  it('stays quiet when a model is configured', async () => {
    installMoneyBridge({
      'review:queue': reviewRow({}),
      'categories:list': [],
      'model:status': { localOnly: false, reason: 'Categorizing with claude-haiku-4-5.' },
    });
    render(<Review />);
    await waitFor(() => screen.getByText('Uber Eats'));
    expect(screen.queryByText(/Set one up under/)).toBeNull();
  });
})
