import { describe, it, expect } from 'vitest';
import { fetchItemAccounts } from '@main/plaid/accounts';
import type { PlaidApi } from 'plaid';

function client(over: Record<string, unknown>): PlaidApi {
  return over as unknown as PlaidApi;
}

const balanceResponse = {
  data: {
    item: { institution_id: 'ins_1', available_products: ['transactions'] },
    accounts: [
      {
        account_id: 'pa_1',
        name: 'Everyday Checking',
        mask: '4321',
        type: 'depository',
        subtype: 'checking',
        balances: { current: 847.0 },
      },
      {
        account_id: 'pa_2',
        name: 'Credit Card',
        mask: null,
        type: 'credit',
        subtype: null,
        balances: { current: null },
      },
    ],
  },
};

describe('fetching accounts after linking', () => {
  it('maps accounts and converts balances to minor units', async () => {
    const r = await fetchItemAccounts(
      client({
        accountsBalanceGet: async () => balanceResponse,
        institutionsGetById: async () => ({ data: { institution: { name: 'Chase' } } }),
      }),
      'at_1',
    );
    expect(r.institutionName).toBe('Chase');
    expect(r.accounts[0]?.currentBalanceMinor).toBe(84_700);
    expect(r.accounts[0]?.mask).toBe('4321');
  });

  it('keeps a null balance null rather than defaulting to zero', async () => {
    const r = await fetchItemAccounts(
      client({
        accountsBalanceGet: async () => balanceResponse,
        institutionsGetById: async () => ({ data: { institution: { name: 'Chase' } } }),
      }),
      'at_1',
    );
    // A zero balance and an unknown balance are different facts.
    expect(r.accounts[1]?.currentBalanceMinor).toBeNull();
    expect(r.accounts[1]?.subtype).toBeNull();
  });

  it('still connects when the institution name lookup fails', async () => {
    const r = await fetchItemAccounts(
      client({
        accountsBalanceGet: async () => balanceResponse,
        institutionsGetById: async () => {
          throw new Error('not found');
        },
      }),
      'at_1',
    );
    expect(r.institutionName).toBe('Connected bank');
    expect(r.accounts).toHaveLength(2);
  });

  it('handles an item with no institution id', async () => {
    const r = await fetchItemAccounts(
      client({
        accountsBalanceGet: async () => ({
          data: { ...balanceResponse.data, item: { institution_id: null, available_products: [] } },
        }),
      }),
      'at_1',
    );
    expect(r.institutionName).toBe('Connected bank');
  });
});
