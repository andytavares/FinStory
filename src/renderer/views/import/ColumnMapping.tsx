import { useState } from 'react';
import { Button, Card, Eyebrow, Field, Select } from '../../components/ui';
import type { CsvColumnChoice } from './flow';

const COLUMNS = [
  ['date', 'Date', true],
  ['payee', 'Payee', true],
  ['amount', 'Amount', false],
  ['debit', 'Debit', false],
  ['credit', 'Credit', false],
] as const;

interface ColumnMappingProps {
  readonly headers: readonly string[];
  readonly onRead: (mapping: CsvColumnChoice) => void;
}

/** Fallback for a CSV whose header row Money does not recognise. */
export function ColumnMapping({ headers, onRead }: ColumnMappingProps): React.JSX.Element {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const ready = picked['date'] && picked['payee'] && (picked['amount'] || picked['debit'] || picked['credit']);
  const read = (): void =>
    onRead(
      Object.fromEntries(
        Object.entries(picked).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]),
      ) as unknown as CsvColumnChoice,
    );
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Eyebrow>Which column is which?</Eyebrow>
      <div className="ds-faint" style={{ fontSize: 12 }}>
        Money could not find the column headers. Pick the date, payee and amount (or debit and credit) columns.
      </div>
      {COLUMNS.map(([key, label, required]) => (
        <Field key={key} label={required ? label : `${label} (optional)`}>
          <Select
            aria-label={`${label} column`}
            value={picked[key] ?? ''}
            onChange={(e) => setPicked({ ...picked, [key]: e.target.value })}
          >
            <option value="">Not used</option>
            {headers.map((header, index) => (
              <option key={index} value={index}>{header || `Column ${index + 1}`}</option>
            ))}
          </Select>
        </Field>
      ))}
      <div className="ds-row">
        <Button variant="primary" disabled={!ready} onClick={read} style={{ marginLeft: 'auto' }}>
          Read file
        </Button>
      </div>
    </Card>
  );
}
