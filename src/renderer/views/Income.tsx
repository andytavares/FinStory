import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { EmptyState } from '../components/EmptyState';
import { AddIncomeSource } from '../components/AddIncomeSource';
import { Button, Card, PageHeader } from '../components/ui';
import { IncomeVsSpending } from '../charts/IncomeVsSpending';
import { money } from '../lib/format';
import { SourceCard } from './income/SourceCard';
import { monthlyIncomeMinor } from './income/monthlyIncome';
import type { IncomeSourceView, IncomeMonth } from '@shared/types';

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
}

/** FR-071: confirm or override a detected pattern. Detection is the default. */
export function Income({
  onOpenMerchant,
}: {
  onOpenMerchant: (merchantKey: string) => void;
}): React.JSX.Element {
  const { data, loading, refetch } = useQuery<IncomeSourceView[]>('income:list');
  const history = useQuery<IncomeMonth[]>('income:history');
  const [adding, setAdding] = useState(false);

  if (loading) return <p className="text-[var(--color-ink-faint)]">Loading…</p>;
  const sources = data ?? [];

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="Income"
        sub={sources.length > 0 ? `${money(monthlyIncomeMinor(sources))} a month expected` : ''}
        actions={
          <>
            <Button onClick={() => void call('analysis:refresh').then(refetch)}>Rescan</Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add income
            </Button>
          </>
        }
      />
      <AddIncomeSource open={adding} onClose={() => setAdding(false)} onAdded={refetch} />
      {sources.length === 0 ? (
        <EmptyState
          title="No recurring income detected yet"
          detail="Deposits are matched into a pattern automatically. Until one is found, balance projections are withheld rather than guessed. Rescan to check again now."
        />
      ) : (
        <div className="ds-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="space-y-3.5">
            {sources.map((s) => (
              <SourceCard key={s.id} source={s} onChanged={refetch} onOpenMerchant={onOpenMerchant} />
            ))}
          </div>
          <Card title="Deposits vs spending">
            <div className="ds-caption">Last 6 months</div>
            <IncomeVsSpending
              data={(history.data ?? []).map((m) => ({
                label: monthLabel(m.month),
                income: m.incomeMinor,
                spending: m.spendingMinor,
              }))}
            />
          </Card>
        </div>
      )}
      <Card style={{ borderStyle: 'dashed' }} className="ds-row">
        <div className="flex-1">
          <div className="font-semibold">Paid in cash or into an account Money cannot see?</div>
          <div className="ds-caption">Add it so runway and safe-to-spend include it.</div>
        </div>
        <Button onClick={() => setAdding(true)}>Add income</Button>
      </Card>
    </div>
  );
}
