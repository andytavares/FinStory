import { describe, it, expect } from 'vitest';
import { isEverydayAccount } from '@main/accounts/everyday';

describe('isEverydayAccount', () => {
  it('counts a checking account', () => {
    expect(isEverydayAccount('depository', 'checking')).toBe(true);
  });

  it('counts a credit card — this is where most spending happens', () => {
    expect(isEverydayAccount('credit', 'credit card')).toBe(true);
  });

  it('excludes a savings account', () => {
    expect(isEverydayAccount('depository', 'savings')).toBe(false);
  });

  it('excludes retirement and brokerage holdings', () => {
    expect(isEverydayAccount('investment', '401k')).toBe(false);
    expect(isEverydayAccount('depository', 'brokerage')).toBe(false);
    expect(isEverydayAccount('investment', null)).toBe(false);
  });

  it('excludes loans', () => {
    expect(isEverydayAccount('loan', 'student')).toBe(false);
  });

  it('counts an account with no subtype reported', () => {
    expect(isEverydayAccount('credit', null)).toBe(true);
  });

  it('is case insensitive, since Plaid subtype casing varies', () => {
    expect(isEverydayAccount('Depository', 'Savings')).toBe(false);
    expect(isEverydayAccount('INVESTMENT', 'IRA')).toBe(false);
  });
});
