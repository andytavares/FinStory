import { describe, it, expect } from 'vitest';
import { plaidError } from '@main/plaid/client';

describe('plaidError', () => {
  it("replaces the SDK's bare status message with Plaid's code and message", () => {
    const sdkError = Object.assign(new Error('Request failed with status code 400'), {
      response: {
        data: {
          error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',
          error_message: 'Underlying transaction data changed since last page was fetched.',
        },
      },
    });
    const result = plaidError(sdkError) as Error & { code: string };

    expect(result.code).toBe('TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION');
    expect(result.message).toBe(
      'Underlying transaction data changed since last page was fetched. (TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION)',
    );
  });

  it('returns errors without a Plaid body unchanged', () => {
    const network = new Error('getaddrinfo ENOTFOUND production.plaid.com');
    expect(plaidError(network)).toBe(network);
  });
});
