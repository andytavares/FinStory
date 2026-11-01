import { describe, it, expect } from 'vitest';
import { parseQuickenCsv, detectCsvColumns } from '@main/import/csv';

const MAC_EXPORT = [
  'Quicken Register Export,01/01/2025 - 01/31/2025',
  'Date,Account,Payee,Category,Memo,Amount,Check #',
  '1/14/2025,Checking,"Trader Joe\'s, Inc.",Food:Groceries,"Said ""hi""",-45.67,',
  '1/15/2025,Checking,Paycheck,Income:Salary,,"$1,234.56",',
  '01/16/25,Savings,Refund,Misc,,(12.00),1001',
  '13/45/2020,Checking,Broken,,,5.00,',
  '',
  ',,Total,,,"1,177.00",',
].join('\r\n');

describe('detectCsvColumns', () => {
  it('maps aliases case-insensitively', () => {
    expect(detectCsvColumns([' DATE ', 'Description', 'Withdrawal', 'Deposit', 'Notes'])).toEqual({
      date: 0,
      payee: 1,
      debit: 2,
      credit: 3,
      memo: 4,
    });
  });

  it('returns null without a date and payee column', () => {
    expect(detectCsvColumns(['Amount', 'Memo'])).toBeNull();
  });
});

describe('parseQuickenCsv', () => {
  const result = parseQuickenCsv(MAC_EXPORT);

  it('skips the title line and reads quoted fields', () => {
    expect(result.format).toBe('csv');
    expect(result.transactions[0]).toEqual({
      accountLabel: 'Checking',
      date: '2025-01-14',
      amountMinor: -4567,
      payee: "Trader Joe's, Inc.",
      memo: 'Said "hi"',
      category: 'Food:Groceries',
      checkNumber: null,
      fitId: null,
    });
  });

  it('reads dollar signs, thousands separators and parentheses', () => {
    expect(result.transactions.map((t) => t.amountMinor)).toEqual([-4567, 123456, -1200]);
    expect(result.transactions[2]).toMatchObject({ date: '2025-01-16', checkNumber: '1001' });
  });

  it('warns on unreadable dates and skips totals and blanks silently', () => {
    expect(result.warnings).toEqual(["Row 6: unreadable date '13/45/2020', skipped"]);
  });

  it('summarises accounts', () => {
    expect(result.accounts).toEqual([
      { label: 'Checking', count: 2, firstDate: '2025-01-14', lastDate: '2025-01-15' },
      { label: 'Savings', count: 1, firstDate: '2025-01-16', lastDate: '2025-01-16' },
    ]);
  });

  it('uses debit and credit columns and a default account label', () => {
    const text = 'Date,Payee,Debit,Credit\n2025-02-01,Rent,"1,000.00",\n2025-02-02,Gift,,25.50';
    const r = parseQuickenCsv(text);
    expect(r.transactions.map((t) => [t.accountLabel, t.amountMinor])).toEqual([
      ['Imported account', -100000],
      ['Imported account', 2550],
    ]);
  });

  it('warns on European amounts', () => {
    const r = parseQuickenCsv('Date,Payee,Amount\n2025-02-01,Shop,"1.234,56"');
    expect(r.transactions).toEqual([]);
    expect(r.warnings).toEqual(["Row 2: unreadable amount '1.234,56', skipped"]);
  });

  it('asks for a mapping when no header is found', () => {
    const r = parseQuickenCsv('a,b,c\n1,2,3');
    expect(r.transactions).toEqual([]);
    expect(r.warnings).toEqual([
      'Could not find the column headers. Choose which column holds the date, payee and amount.',
    ]);
  });

  it('uses an explicit mapping and treats row 1 as data', () => {
    const r = parseQuickenCsv('3/4/2025,5.00,Cafe', { date: 0, amount: 1, payee: 2 });
    expect(r.transactions[0]).toMatchObject({ date: '2025-03-04', amountMinor: 500, payee: 'Cafe' });
  });
});
