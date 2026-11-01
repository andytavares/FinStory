import { parseSync } from 'ofx-js';
import { toMinor } from '@shared/money';
import { buildResult, parseDate } from './common';
import type { ImportedTransaction, ParseResult } from './types';

// ofx-js types its parsed tree as any; the shape depends on the bank.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OfxNode = Record<string, any>;

const STATEMENT_PATHS = [
  { messages: 'BANKMSGSRSV1', response: 'STMTTRNRS', statement: 'STMTRS', account: 'BANKACCTFROM' },
  { messages: 'CREDITCARDMSGSRSV1', response: 'CCSTMTTRNRS', statement: 'CCSTMTRS', account: 'CCACCTFROM' },
] as const;

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function accountLabel(account: OfxNode | undefined, isCard: boolean): string {
  const type = isCard ? 'Credit card' : String(account?.ACCTTYPE ?? 'Account');
  return `${type} ••${String(account?.ACCTID ?? '').slice(-4)}`;
}

function optionalText(value: unknown): string | null {
  return value === undefined ? null : String(value);
}

function postedDate(node: OfxNode): string | null {
  const d = String(node.DTPOSTED ?? '');
  return parseDate(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`);
}

function payeeOf(node: OfxNode): string {
  return String(node.NAME ?? node.PAYEE?.NAME ?? node.MEMO ?? '');
}

/** A transaction, or a warning when its date or amount cannot be read. */
function toTransaction(node: OfxNode, label: string): ImportedTransaction | string {
  const date = postedDate(node);
  const amount = Number(node.TRNAMT);
  if (!date || node.TRNAMT === undefined || !Number.isFinite(amount)) {
    return `Transaction '${String(node.FITID ?? node.NAME ?? '')}' skipped: unreadable date or amount`;
  }
  return {
    accountLabel: label,
    date,
    amountMinor: toMinor(amount),
    payee: payeeOf(node),
    memo: optionalText(node.MEMO),
    category: null,
    checkNumber: optionalText(node.CHECKNUM),
    fitId: optionalText(node.FITID),
  };
}

export async function parseOfx(text: string): Promise<ParseResult> {
  const { OFX } = parseSync(text);
  const transactions: ImportedTransaction[] = [];
  const warnings: string[] = [];
  for (const path of STATEMENT_PATHS) {
    for (const response of toArray<OfxNode>(OFX[path.messages]?.[path.response])) {
      const statement: OfxNode | undefined = response[path.statement];
      const label = accountLabel(statement?.[path.account], path.messages === 'CREDITCARDMSGSRSV1');
      const nodes = toArray<OfxNode>(statement?.BANKTRANLIST?.STMTTRN);
      for (const parsed of nodes.map((node) => toTransaction(node, label))) {
        if (typeof parsed === 'string') warnings.push(parsed);
        else transactions.push(parsed);
      }
    }
  }
  return buildResult('ofx', transactions, warnings);
}
