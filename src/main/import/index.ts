import { createHash } from 'node:crypto';
import { parseQuickenCsv } from './csv';
import { parseOfx } from './ofx';
import { parseQif } from './qif';
import type { CsvColumnMapping, ImportedTransaction, ParseResult } from './types';

const UNSUPPORTED_MESSAGE =
  "Money can read CSV, QIF, QFX and OFX files. Quicken's own .QDF file cannot be read; in Quicken choose File › Export first.";

type Format = ParseResult['format'];

function formatFromName(fileName: string): Format | null {
  const extension = fileName.toLowerCase().split('.').pop();
  if (extension === 'csv') return 'csv';
  if (extension === 'qif') return 'qif';
  return extension === 'qfx' || extension === 'ofx' ? 'ofx' : null;
}

function formatFromContent(text: string): Format | null {
  const start = text.trimStart();
  if (start.startsWith('OFXHEADER') || /<OFX>/i.test(start.slice(0, 2000))) return 'ofx';
  return /^!Type:/im.test(text) ? 'qif' : null;
}

export async function parseImportFile(
  fileName: string,
  text: string,
  mapping?: CsvColumnMapping,
): Promise<ParseResult> {
  const format = formatFromName(fileName) ?? formatFromContent(text);
  if (format === 'csv') return parseQuickenCsv(text, mapping);
  if (format === 'qif') return parseQif(text);
  if (format === 'ofx') return parseOfx(text);
  throw new Error(UNSUPPORTED_MESSAGE);
}

export function importId(t: ImportedTransaction): string {
  const key = `${t.accountLabel}|${t.date}|${t.amountMinor}|${t.payee.trim().toLowerCase()}|${t.fitId ?? ''}`;
  return `import:${createHash('sha256').update(key).digest('hex')}`;
}
