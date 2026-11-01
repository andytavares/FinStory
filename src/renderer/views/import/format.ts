import type { ImportPreview } from '@shared/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2019-01-14" becomes "Jan 2019". */
export function monthYear(isoDate: string): string {
  return `${MONTHS[Number(isoDate.slice(5, 7)) - 1] ?? ''} ${isoDate.slice(0, 4)}`;
}

/** QFX is OFX with a different extension; Quicken users know the file by that name. */
export function formatName(format: ImportPreview['format'], fileName: string): string {
  if (format === 'ofx') return fileName.toLowerCase().endsWith('.qfx') ? 'QFX' : 'OFX';
  return format.toUpperCase();
}

export function describeFile(preview: ImportPreview, fileName: string): string {
  const total = preview.accounts.reduce((sum, a) => sum + a.count, 0);
  const first = preview.accounts.map((a) => a.firstDate).sort()[0];
  const last = preview.accounts.map((a) => a.lastDate).sort().at(-1);
  const range = first && last ? ` · ${monthYear(first)} – ${monthYear(last)}` : '';
  return `${formatName(preview.format, fileName)} · ${total.toLocaleString('en-US')} transactions${range}`;
}

export const plural = (n: number, noun: string): string => `${n.toLocaleString('en-US')} ${noun}${n === 1 ? '' : 's'}`;
