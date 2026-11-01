import { transactionName } from '../../lib/name';
import type { TransactionView } from '@shared/types';

const quote = (cell: string): string => `"${cell.replaceAll('"', '""')}"`;

/** Saves the loaded rows through a Blob link; Electron shows its save dialog. */
export function downloadCsv(
  rows: readonly TransactionView[],
  categoryName: (categoryId: string) => string,
): void {
  const lines = rows.map((t) =>
    [t.postedDate.slice(0, 10), transactionName(t), categoryName(t.categoryId), (t.amountMinor / 100).toFixed(2)]
      .map(quote)
      .join(','),
  );
  const csv = ['Date,Merchant,Category,Amount', ...lines].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'money-transactions.csv';
  link.click();
  URL.revokeObjectURL(url);
}
