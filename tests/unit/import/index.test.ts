import { describe, it, expect } from 'vitest';
import { parseImportFile, importId } from '@main/import';
import type { ImportedTransaction } from '@main/import/types';

const base: ImportedTransaction = {
  accountLabel: 'Checking',
  date: '2025-01-14',
  amountMinor: -4567,
  payee: 'Trader Joe',
  memo: null,
  category: null,
  checkNumber: null,
  fitId: null,
};

describe('parseImportFile', () => {
  it('picks the parser by extension, case-insensitively', async () => {
    expect((await parseImportFile('X.QIF', '!Type:Bank\nD1/2/2025\nT-5\nPA\n^')).format).toBe('qif');
    expect((await parseImportFile('x.csv', 'Date,Payee,Amount\n2025-01-02,A,5')).format).toBe('csv');
  });

  it('sniffs content when the extension is unknown', async () => {
    expect((await parseImportFile('export.txt', '!Type:Bank\nD1/2/2025\nT-5\nPA\n^')).format).toBe('qif');
    expect((await parseImportFile('export.txt', 'OFXHEADER:100\n<OFX></OFX>')).format).toBe('ofx');
  });

  it.each(['file.qdf', 'file.qxf', 'file.bin'])('rejects %s', async (name) => {
    await expect(parseImportFile(name, 'binary')).rejects.toThrow(
      "Money can read CSV, QIF, QFX and OFX files. Quicken's own .QDF and .QXF files cannot be read; in Quicken choose File › Export › QIF File first.",
    );
  });
});

describe('importId', () => {
  it('is stable and prefixed', () => {
    expect(importId(base)).toBe(importId({ ...base }));
    expect(importId(base)).toMatch(/^import:[0-9a-f]{64}$/);
  });

  it('ignores payee case and padding but not amount or fitId', () => {
    expect(importId({ ...base, payee: '  TRADER JOE ' })).toBe(importId(base));
    expect(importId({ ...base, amountMinor: -4568 })).not.toBe(importId(base));
    expect(importId({ ...base, fitId: 'A1' })).not.toBe(importId(base));
  });
});
