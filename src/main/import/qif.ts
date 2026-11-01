import { buildResult, parseAmount, parseDate } from './common';
import type { ImportedTransaction, ParseResult } from './types';

const SPLIT_WARNING = 'Split transactions imported as single amounts';
const INVESTMENT_WARNING = 'Investment transactions are not imported';
const SKIPPED_TYPES = ['Invst', 'Cat', 'Class'];

interface QifState {
  accountName: string | null;
  label: string;
  skipping: boolean;
  inAccountBlock: boolean;
  fields: Map<string, string>;
  transactions: ImportedTransaction[];
  warnings: string[];
}

/** A `[Account]` category marks a transfer: it becomes a memo, not a category. */
function categoryAndMemo(fields: Map<string, string>): { category: string | null; memo: string | null } {
  const category = fields.get('L') ?? '';
  const transfer = /^\[(.*)\]/.exec(category);
  const memo = [fields.get('M'), transfer ? `Transfer: ${transfer[1]}` : null].filter(Boolean).join('; ');
  return { category: transfer || category === '' ? null : category, memo: memo || null };
}

function text(fields: Map<string, string>, code: string): string {
  return fields.get(code) ?? '';
}

function toTransaction(fields: Map<string, string>, label: string): ImportedTransaction | null {
  const date = parseDate(text(fields, 'D'));
  const amountMinor = parseAmount(fields.get('T') ?? text(fields, 'U'));
  if (!date || amountMinor === null) return null;
  return {
    accountLabel: label,
    date,
    amountMinor,
    payee: text(fields, 'P'),
    ...categoryAndMemo(fields),
    checkNumber: fields.get('N') || null,
    fitId: null,
  };
}

function startSection(state: QifState, line: string): void {
  if (line.toLowerCase().startsWith('!account')) {
    state.inAccountBlock = true;
    return;
  }
  const type = /^!Type:\s*(.*)$/i.exec(line)?.[1]?.trim();
  if (type === undefined) return;
  state.skipping = SKIPPED_TYPES.includes(type);
  state.label = state.accountName ?? type;
  if (type === 'Invst' && !state.warnings.includes(INVESTMENT_WARNING)) state.warnings.push(INVESTMENT_WARNING);
}

function endRecord(state: QifState): void {
  const { fields } = state;
  if (state.inAccountBlock) {
    state.accountName = fields.get('N') ?? state.accountName;
    state.inAccountBlock = false;
  } else if (!state.skipping && fields.size > 0) {
    const transaction = toTransaction(fields, state.label);
    if (transaction) state.transactions.push(transaction);
    else state.warnings.push(`Record with date '${fields.get('D') ?? ''}' skipped: unreadable date or amount`);
  }
  state.fields = new Map();
}

function addField(state: QifState, line: string): void {
  const code = line[0] ?? '';
  if (code === 'S' && !state.warnings.includes(SPLIT_WARNING)) state.warnings.push(SPLIT_WARNING);
  if ('DTUPMLN'.includes(code) && !state.fields.has(code)) state.fields.set(code, line.slice(1).trim());
}

export function parseQif(text: string): ParseResult {
  const state: QifState = {
    accountName: null,
    label: 'Imported account',
    skipping: false,
    inAccountBlock: false,
    fields: new Map(),
    transactions: [],
    warnings: [],
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('!')) startSection(state, line);
    else if (line === '^') endRecord(state);
    else if (line !== '') addField(state, line);
  }
  return buildResult('qif', state.transactions, state.warnings);
}
