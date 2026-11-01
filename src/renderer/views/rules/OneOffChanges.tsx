import { useState } from 'react';
import { call } from '../../lib/ipc';
import { Button, Card, ListRow, ListRows } from '../../components/ui';
import { EmptyState } from '../../components/EmptyState';
import { shortDate } from '../../lib/format';
import type { OverrideKind, OverrideRecord } from '@shared/types';

const GROUPS: ReadonlyArray<{ kind: OverrideKind; title: string; blurb: string }> = [
  { kind: 'transaction_name', title: 'Single transaction renames', blurb: 'Applies to one transaction only.' },
  { kind: 'transaction_category', title: 'Single transaction categories', blurb: 'A category you set by hand on one transaction.' },
  { kind: 'excluded', title: 'Excluded from totals', blurb: 'Kept on record, left out of every total.' },
  { kind: 'recurring_rule', title: 'Recurring decisions', blurb: 'Covers every instance of that charge, including ones that arrive later.' },
  { kind: 'recurring', title: 'Single transaction recurring flags', blurb: 'Set on one transaction rather than the whole charge.' },
  { kind: 'note', title: 'Notes', blurb: 'Your own text on a transaction.' },
];

function OverrideRow({
  record,
  busy,
  onUndo,
}: {
  record: OverrideRecord;
  busy: boolean;
  onUndo: () => void;
}): React.JSX.Element {
  return (
    <ListRow>
      <div className="min-w-0 flex-1">
        <p className="truncate">{record.label}</p>
        <p className="ds-faint text-[12px]">
          {record.original === null ? record.current : `${record.original} → ${record.current}`}
        </p>
        <p className="ds-faint text-[12px]">
          {record.affectedCount === 1 ? '1 transaction' : `${record.affectedCount} transactions`}
          {record.occurredAt && ` · ${shortDate(record.occurredAt)}`}
        </p>
      </div>
      <Button size="sm" onClick={onUndo} disabled={busy} aria-label={`Undo override for ${record.label}`}>
        {busy ? 'Undoing…' : 'Undo'}
      </Button>
    </ListRow>
  );
}

/**
 * Changes the user made to one transaction, plus recurring decisions.
 *
 * Without this a rename or exclusion made months ago is invisible until it
 * shows up wrong in a report, with no way to find what caused it.
 */
export function OneOffChanges({
  records,
  onChanged,
}: {
  records: readonly OverrideRecord[];
  onChanged: () => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState<string | null>(null);

  const clear = async (record: OverrideRecord): Promise<void> => {
    setBusy(record.id);
    try {
      await call('overrides:clear', { kind: record.kind, target: record.target });
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  if (records.length === 0) {
    return (
      <EmptyState
        title="You have not made any one-off changes yet"
        detail="Changes you make to a single transaction are listed here so you can find and undo them."
      />
    );
  }

  return (
    <>
      {GROUPS.map((group) => {
        const rows = records.filter((r) => r.kind === group.kind);
        if (rows.length === 0) return null;
        return (
          <Card key={group.kind} title={group.title} caption={group.blurb}>
            <ListRows>
              {rows.map((r) => (
                <OverrideRow key={r.id} record={r} busy={busy === r.id} onUndo={() => void clear(r)} />
              ))}
            </ListRows>
          </Card>
        );
      })}
      <p className="ds-faint text-[12px]">
        Undoing hands the decision back to the app. Nothing is deleted from your transaction
        history.
      </p>
    </>
  );
}
