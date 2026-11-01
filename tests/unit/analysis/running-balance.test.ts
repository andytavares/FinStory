import { describe, it, expect } from 'vitest';
import { runningBalances } from '@main/analysis/running-balance';

const ROWS = [
  { id: 'paycheck', amountMinor: 200_000 },
  { id: 'groceries', amountMinor: -8_000 },
  { id: 'rent', amountMinor: -150_000 },
];

describe('runningBalances', () => {
  it('works back from the current balance of a checking account', () => {
    const after = runningBalances(ROWS, { currentBalanceMinor: 300_000, type: 'depository' });
    expect([...after]).toEqual([
      ['paycheck', 300_000],
      ['groceries', 100_000],
      ['rent', 108_000],
    ]);
  });

  it('counts spending as raising what is owed on a credit card', () => {
    const after = runningBalances(ROWS, { currentBalanceMinor: 50_000, type: 'credit' });
    expect([...after]).toEqual([
      ['paycheck', 50_000],
      ['groceries', 250_000],
      ['rent', 242_000],
    ]);
  });

  it('returns nothing for an account with no transactions', () => {
    expect(runningBalances([], { currentBalanceMinor: 1, type: 'depository' }).size).toBe(0);
  });
});
