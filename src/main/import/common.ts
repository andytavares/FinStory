import { toMinor } from '@shared/money';
import type { ImportedTransaction, ParseResult } from './types';

const AMOUNT_PATTERN = /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;
const US_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})(['/])(\d{2}|\d{4})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isoDate(year: number, month: number, day: number): string | null {
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  return probe.toISOString().slice(0, 10);
}

function expandYear(digits: string, separator: string): number {
  if (digits.length === 4) return Number(digits);
  const year = Number(digits);
  return separator === "'" || year < 70 ? 2000 + year : 1900 + year;
}

/** Reads M/D/YYYY, M/D/YY, M/D'YY (2000s) and YYYY-MM-DD; null when unreadable. */
export function parseDate(text: string): string | null {
  const value = text.replace(/\s+/g, '');
  const iso = ISO_DATE_PATTERN.exec(value);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const us = US_DATE_PATTERN.exec(value);
  if (!us) return null;
  return isoDate(expandYear(us[4] ?? '', us[3] ?? '/'), Number(us[1]), Number(us[2]));
}

/** Reads "$1,234.56", "-12.00" and "(12.00)" into cents; null when unreadable. */
export function parseAmount(text: string): number | null {
  let value = text.replace(/[$\s]/g, '');
  const parenthesised = /^\(.*\)$/.test(value);
  if (parenthesised) value = `-${value.slice(1, -1)}`;
  if (!AMOUNT_PATTERN.test(value)) return null;
  return toMinor(Number(value.replace(/,/g, '')));
}

export function buildResult(
  format: ParseResult['format'],
  transactions: ImportedTransaction[],
  warnings: string[],
): ParseResult {
  const byAccount = new Map<string, ParseResult['accounts'][number]>();
  for (const { accountLabel, date } of transactions) {
    const entry = byAccount.get(accountLabel);
    if (!entry) {
      byAccount.set(accountLabel, { label: accountLabel, count: 1, firstDate: date, lastDate: date });
      continue;
    }
    entry.count += 1;
    if (date < entry.firstDate) entry.firstDate = date;
    if (date > entry.lastDate) entry.lastDate = date;
  }
  return { format, transactions, accounts: [...byAccount.values()], warnings };
}
