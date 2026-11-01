import { useEffect, useRef, useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { RecategorizeButton } from '../components/RecategorizeButton';
import { EmptyState } from '../components/EmptyState';
import { Button, Card, PageHeader, ProgressBar } from '../components/ui';
import {
  ReviewItemCard,
  suggestionsFor,
  type CategoryOption,
  type SuggestedItem,
} from './review/ReviewItemCard';

interface QueueResponse {
  readonly rows: SuggestedItem[];
  readonly totalCount: number;
}

interface ModelStatus {
  readonly localOnly: boolean;
  readonly reason: string;
}

/**
 * Why everything is uncategorized.
 *
 * A queue full of "uncategorizable at 0%" with no explanation reads as the app
 * being broken. It is usually a setting.
 */
function ModelNotice(): React.JSX.Element | null {
  const { data } = useQuery<ModelStatus>('model:status');
  if (!data?.localOnly) return null;
  return (
    <Card role="status" className="ds-caption">
      {data.reason} Transactions a model could name are landing here instead. Set one up under
      Settings, then use Sort these with AI.
    </Card>
  );
}


function ProgressCard({ done, total }: { done: number; total: number }): React.JSX.Element {
  return (
    <Card className="ds-row gap-[14px] !px-4 !py-2.5">
      <div className="flex-1">
        <ProgressBar value={total ? done / total : 0} label="Review progress" />
      </div>
      <span className="ds-faint numeric">
        {done} of {total} done
      </span>
      <span className="ds-faint">
        Keys: <span className="numeric">1–3</span> pick · <span className="numeric">↵</span> accept ·{' '}
        <span className="numeric">S</span> skip
      </span>
    </Card>
  );
}

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);

/** FR-067: clearing a month of flags is a short session, so most items take one keypress. */
export function Review(): React.JSX.Element {
  const { data, loading, refetch } = useQuery<QueueResponse>('review:queue', { limit: 100, offset: 0 });
  const categories = useQuery<CategoryOption[]>('categories:list', { includeHidden: false });
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [always, setAlways] = useState<Readonly<Record<string, boolean>>>({});
  const largestTotal = useRef(0);
  const rows = data?.rows ?? [];
  const total = data?.totalCount ?? 0;
  const focusedItem = rows[Math.min(focusedIndex, rows.length - 1)];

  largestTotal.current = Math.max(largestTotal.current, total);
  const startTotal = largestTotal.current;

  const pick = async (item: SuggestedItem, categoryId: string): Promise<void> => {
    const { id, merchantKey } = item.transaction;
    await call('review:recategorize', { transactionIds: [id], categoryId });
    if (always[id] && merchantKey) await call('rules:update', { merchantKey, categoryId });
    refetch();
  };

  const accept = async (transactionIds: string[]): Promise<void> => {
    await call('review:dismissFlag', { transactionIds });
    refetch();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!focusedItem || isTyping(e.target) || e.metaKey || e.ctrlKey) return;
      const suggestion = suggestionsFor(focusedItem)[Number(e.key) - 1];
      if (suggestion) void pick(focusedItem, suggestion.categoryId);
      else if (e.key === 'Enter') void accept([focusedItem.transaction.id]);
      else if (e.key.toLowerCase() === 's') setFocusedIndex(Math.min(focusedIndex + 1, rows.length - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (loading) return <p className="ds-caption">Loading…</p>;
  if (!data || rows.length === 0) {
    return (
      <EmptyState
        title="Nothing needs your review"
        detail="Low-confidence categorizations land here. Everything else is handled without you."
      />
    );
  }

  const done = startTotal - total;
  return (
    <>
      <PageHeader
        title="Review"
        sub={`${total} charges Money was unsure about`}
        actions={
          <>
            <RecategorizeButton compact onDone={refetch} />
            <Button variant="primary" onClick={() => void accept(rows.map((r) => r.transaction.id))}>
              Accept all {total} guesses
            </Button>
          </>
        }
      />
      <ModelNotice />
      <ProgressCard done={done} total={startTotal} />
      {rows.map((item, index) => (
        <ReviewItemCard
          key={item.transaction.id}
          item={item}
          categories={categories.data ?? []}
          focused={item === focusedItem}
          always={always[item.transaction.id] ?? false}
          onFocus={() => setFocusedIndex(index)}
          onAlways={(next) => setAlways({ ...always, [item.transaction.id]: next })}
          onPick={(categoryId) => void pick(item, categoryId)}
        />
      ))}
    </>
  );
}
