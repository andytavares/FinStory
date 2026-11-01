import { Card, Chip, MerchantMark, Table } from '../../components/ui';
import { Money } from '../../components/Money';
import { RecurringChip } from '../../components/RecurringChip';
import { categoryColor } from '../../lib/categoryColor';
import { shortDate } from '../../lib/format';
import { transactionName } from '../../lib/name';
import type { TransactionView } from '@shared/types';

function SourceChip({ transaction }: { transaction: TransactionView }): React.JSX.Element | null {
  if (transaction.needsReview) return <Chip tone="warn">Check</Chip>;
  if (transaction.categorySource === 'rule') return <Chip tone="accent">Your rule</Chip>;
  if (transaction.categorySource === 'user') return <Chip tone="accent">You set this</Chip>;
  return null;
}

interface Selection {
  readonly id: string | null;
  readonly onSelect: (id: string) => void;
}

interface TransactionRowProps {
  readonly transaction: TransactionView;
  readonly categoryName: (categoryId: string) => string;
  readonly selection: Selection;
  readonly showBalance: boolean;
}

function TransactionRow({
  transaction: t,
  categoryName,
  selection,
  showBalance,
}: TransactionRowProps): React.JSX.Element {
  const { id: selectedId, onSelect } = selection;
  return (
    <tr
      aria-selected={t.id === selectedId}
      onClick={() => onSelect(t.id)}
      className="cursor-pointer"
    >
      <td className="numeric text-[var(--color-ink-faint)]">{shortDate(t.postedDate)}</td>
      <td>
        <div className="ds-row">
          <MerchantMark name={transactionName(t)} />
          <button
            type="button"
            aria-label={`Edit ${transactionName(t)}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(t.id);
            }}
            className="cursor-pointer border-0 bg-transparent p-0 text-left text-inherit"
          >
            {transactionName(t)}
          </button>
          {t.isRecurring && <RecurringChip />}
          {t.originalCurrency && (
            // Display-only; never enters a calculation (FR-085).
            <span className="ds-caption">
              {t.originalCurrency} {((t.originalAmountMinor ?? 0) / 100).toFixed(2)}
            </span>
          )}
        </div>
      </td>
      <td>
        <span className="ds-row">
          <Chip dot={categoryColor(t.categoryId)}>{categoryName(t.categoryId)}</Chip>
          <SourceChip transaction={t} />
        </span>
      </td>
      <td className="r">
        <Money minor={t.amountMinor} direction />
      </td>
      {showBalance && (
        <td className="r">
          {t.runningBalanceMinor !== undefined && <Money minor={t.runningBalanceMinor} />}
        </td>
      )}
    </tr>
  );
}

interface TransactionTableProps {
  readonly rows: readonly TransactionView[];
  readonly categoryName: (categoryId: string) => string;
  readonly selection: Selection;
}

export function TransactionTable({
  rows,
  categoryName,
  selection,
}: TransactionTableProps): React.JSX.Element {
  const showBalance = rows.some((t) => t.runningBalanceMinor !== undefined);
  return (
    <Card className="min-w-0 !px-1 !py-0">
      <Table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Merchant</th>
            <th>Category</th>
            <th className="r">Amount</th>
            {showBalance && <th className="r">Balance</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <TransactionRow
              key={t.id}
              transaction={t}
              categoryName={categoryName}
              selection={selection}
              showBalance={showBalance}
            />
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
