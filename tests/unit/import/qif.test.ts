import { describe, it, expect } from 'vitest';
import { parseQif } from '@main/import/qif';

const QIF = [
  '!Account',
  'NChecking',
  'TBank',
  '^',
  '!Type:Bank',
  'D1/14\'25',
  'T-1,045.67',
  'PTrader Joe\'s',
  'MWeekly shop',
  'LFood:Groceries',
  'N1001',
  '^',
  'D 2/ 3/2025',
  'U500.00',
  'PMove to savings',
  'L[Savings]',
  '^',
  'D3/5/25',
  'T-30.00',
  'PSplit store',
  'SFood',
  '$-10.00',
  'SHome',
  '$-20.00',
  '^',
  '!Type:Invst',
  'D1/1/25',
  'NBuy',
  '^',
].join('\n');

describe('parseQif', () => {
  const result = parseQif(QIF);

  it('reads fields, apostrophe years and the account name', () => {
    expect(result.format).toBe('qif');
    expect(result.transactions[0]).toEqual({
      accountLabel: 'Checking',
      date: '2025-01-14',
      amountMinor: -104567,
      payee: "Trader Joe's",
      memo: 'Weekly shop',
      category: 'Food:Groceries',
      checkNumber: '1001',
      fitId: null,
    });
  });

  it('turns transfers into a memo', () => {
    expect(result.transactions[1]).toMatchObject({
      date: '2025-02-03',
      amountMinor: 50000,
      category: null,
      memo: 'Transfer: Savings',
    });
  });

  it('keeps the parent of a split and warns once, and skips investments', () => {
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[2]?.amountMinor).toBe(-3000);
    expect(result.warnings).toEqual([
      'Split transactions imported as single amounts',
      'Investment transactions are not imported',
    ]);
  });

  it('falls back to the type name without an !Account block', () => {
    const r = parseQif('!Type:CCard\nD1/2/2025\nT-5.00\nPCafe\n^');
    expect(r.transactions[0]?.accountLabel).toBe('CCard');
  });
});
