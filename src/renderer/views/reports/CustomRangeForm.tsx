import { useState } from 'react';
import { Button, Card, Field, TextInput } from '../../components/ui';

export interface CustomRange {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly label?: string;
}

export function CustomRangeForm({
  busy,
  onGenerate,
}: {
  busy: boolean;
  onGenerate: (range: CustomRange) => void;
}): React.JSX.Element {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [label, setLabel] = useState('');

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From">
          <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Report start date" />
        </Field>
        <Field label="To">
          <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Report end date" />
        </Field>
        <div className="flex-1">
          <Field label="Name (optional)">
            <TextInput
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Trip to Japan"
              aria-label="Report name"
            />
          </Field>
        </div>
        <Button
          variant="primary"
          disabled={!from || !to || busy}
          onClick={() =>
            onGenerate({
              periodStart: new Date(from).toISOString(),
              periodEnd: new Date(to).toISOString(),
              ...(label.trim() ? { label: label.trim() } : {}),
            })
          }
        >
          Generate
        </Button>
      </div>
    </Card>
  );
}
