export interface ImportedTransaction {
  accountLabel: string;
  /** YYYY-MM-DD */
  date: string;
  /** Integer cents; negative means money out. */
  amountMinor: number;
  payee: string;
  memo: string | null;
  /** Quicken category text, e.g. "Food:Groceries". */
  category: string | null;
  checkNumber: string | null;
  /** OFX FITID when present. */
  fitId: string | null;
}

export interface ParseResult {
  format: 'csv' | 'qif' | 'ofx';
  transactions: ImportedTransaction[];
  accounts: { label: string; count: number; firstDate: string; lastDate: string }[];
  warnings: string[];
}

/** Zero-based column indexes. */
export interface CsvColumnMapping {
  date: number;
  payee: number;
  amount?: number;
  debit?: number;
  credit?: number;
  category?: number;
  memo?: number;
  account?: number;
  checkNumber?: number;
}
