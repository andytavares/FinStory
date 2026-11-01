import { buildResult, parseAmount, parseDate } from './common';
import type { CsvColumnMapping, ImportedTransaction, ParseResult } from './types';

const DEFAULT_ACCOUNT = 'Imported account';
const NO_HEADER_WARNING =
  'Could not find the column headers. Choose which column holds the date, payee and amount.';

const ALIASES: Record<keyof CsvColumnMapping, string[]> = {
  date: ['date', 'posted date', 'transaction date'],
  payee: ['payee', 'description', 'name', 'merchant'],
  amount: ['amount', 'transaction amount'],
  debit: ['debit', 'withdrawal', 'payment', 'outflow'],
  credit: ['credit', 'deposit', 'inflow'],
  category: ['category'],
  memo: ['memo', 'notes', 'note'],
  account: ['account', 'account name'],
  checkNumber: ['check #', 'check number', 'num', 'ref'],
};

/** RFC 4180: quoted commas, doubled quotes and CRLF. */
function splitRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) records.push([...row, field]);
  return records;
}

/** The first row with several filled cells, for the column pickers when no header is recognised. */
export function guessCsvHeaders(text: string): string[] {
  const row = splitRecords(text).find((record) => record.filter((c) => c.trim() !== '').length >= 3);
  return (row ?? []).map((c) => c.trim());
}

export function detectCsvColumns(headerRow: string[]): CsvColumnMapping | null {
  const names = headerRow.map((cell) => cell.trim().toLowerCase());
  const found: Partial<Record<keyof CsvColumnMapping, number>> = {};
  for (const key of Object.keys(ALIASES) as (keyof CsvColumnMapping)[]) {
    const index = names.findIndex((name) => ALIASES[key].includes(name));
    if (index >= 0) found[key] = index;
  }
  if (found.date === undefined || found.payee === undefined) return null;
  return found as CsvColumnMapping;
}

function cell(row: string[], index: number | undefined): string {
  return index === undefined ? '' : (row[index] ?? '').trim();
}

/** Null when a debit/credit row has neither value; 'invalid' when a value is unreadable. */
function readAmount(row: string[], mapping: CsvColumnMapping): number | null | 'invalid' {
  if (mapping.amount !== undefined) return parseAmount(cell(row, mapping.amount)) ?? 'invalid';
  const debit = cell(row, mapping.debit);
  const credit = cell(row, mapping.credit);
  const outflow = debit === '' ? 0 : parseAmount(debit);
  const inflow = credit === '' ? 0 : parseAmount(credit);
  if (outflow === null || inflow === null) return 'invalid';
  return debit === '' && credit === '' ? null : Math.abs(inflow) - Math.abs(outflow);
}

function toTransaction(row: string[], mapping: CsvColumnMapping, rowNumber: number): ImportedTransaction | string {
  const rawDate = cell(row, mapping.date);
  const date = parseDate(rawDate);
  if (!date) return `Row ${rowNumber}: unreadable date '${rawDate}', skipped`;
  const amount = readAmount(row, mapping);
  if (amount === null || amount === 'invalid') {
    const raw = cell(row, mapping.amount ?? mapping.debit ?? mapping.credit);
    return `Row ${rowNumber}: unreadable amount '${raw}', skipped`;
  }
  return {
    accountLabel: cell(row, mapping.account) || DEFAULT_ACCOUNT,
    date,
    amountMinor: amount,
    payee: cell(row, mapping.payee),
    memo: cell(row, mapping.memo) || null,
    category: cell(row, mapping.category) || null,
    checkNumber: cell(row, mapping.checkNumber) || null,
    fitId: null,
  };
}

function findHeader(records: string[][]): { mapping: CsvColumnMapping; index: number } | null {
  for (const [index, record] of records.entries()) {
    const mapping = detectCsvColumns(record);
    if (mapping) return { mapping, index };
  }
  return null;
}

export function hasCsvHeader(text: string): boolean {
  return findHeader(splitRecords(text)) !== null;
}

export function parseQuickenCsv(text: string, mapping?: CsvColumnMapping): ParseResult {
  const records = splitRecords(text);
  const header = mapping ? { mapping, index: -1 } : findHeader(records);
  if (!header) return buildResult('csv', [], [NO_HEADER_WARNING]);
  const transactions: ImportedTransaction[] = [];
  const warnings: string[] = [];
  for (const [index, row] of records.entries()) {
    // A row without a date is blank or a totals line.
    if (index <= header.index || cell(row, header.mapping.date) === '') continue;
    const parsed = toTransaction(row, header.mapping, index + 1);
    if (typeof parsed === 'string') warnings.push(parsed);
    else transactions.push(parsed);
  }
  return buildResult('csv', transactions, warnings);
}
