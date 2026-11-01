import { useState } from 'react';
import { Button, Card, MerchantMark, Select, Toggle } from '../../components/ui';
import { Money } from '../../components/Money';
import { assignableCategories } from '../../components/TransactionEditor';
import { shortDate } from '../../lib/format';
import { transactionName } from '../../lib/name';
import type { ReviewItem } from '@shared/types';

export interface Suggestion {
  readonly categoryId: string;
  readonly name: string;
}

export interface CategoryOption {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly isHidden: boolean;
  readonly mergedIntoId: string | null;
}

export type SuggestedItem = ReviewItem & { readonly suggestions?: readonly Suggestion[] };

/** The guess first, then the merchant's other usual categories. At most three. */
export function suggestionsFor(item: SuggestedItem): Suggestion[] {
  const fallback = [{ categoryId: item.guessCategoryId, name: item.guessCategoryName }];
  return [...(item.suggestions?.length ? item.suggestions : fallback)].slice(0, 3);
}

interface ReviewCardView {
  readonly categories: readonly CategoryOption[];
  readonly focused: boolean;
  readonly always: boolean;
}

interface ReviewCardActions {
  readonly onFocus: () => void;
  readonly onAlways: (next: boolean) => void;
  readonly onPick: (categoryId: string) => void;
}

interface ReviewItemCardProps {
  readonly item: SuggestedItem;
  readonly view: ReviewCardView;
  readonly actions: ReviewCardActions;
}

interface PickButtonsProps {
  readonly item: SuggestedItem;
  readonly name: string;
  readonly categories: readonly CategoryOption[];
  readonly onPick: (categoryId: string) => void;
}

/** One numbered button per suggestion, then "Other…" with a full category list. */
function PickButtons({ item, name, categories, onPick }: PickButtonsProps): React.JSX.Element {
  const [other, setOther] = useState(false);
  return (
    <div className="ds-row mt-2">
      {suggestionsFor(item).map((s, index) => {
        const label = `${s.name}${index === 0 ? ` · ${Math.round(item.confidence * 100)}%` : ''}`;
        return (
          <Button
            key={s.categoryId}
            size="sm"
            variant={index === 0 ? 'primary' : 'default'}
            aria-label={`${index + 1} ${label}`}
            onClick={() => onPick(s.categoryId)}
          >
            <span className="numeric opacity-60">{index + 1}</span>
            {label}
          </Button>
        );
      })}
      <Button size="sm" variant="ghost" onClick={() => setOther(!other)}>
        Other…
      </Button>
      {other && (
        <Select
          aria-label={`Other category for ${name}`}
          defaultValue=""
          onChange={(e) => e.target.value && onPick(e.target.value)}
        >
          <option value="">Choose a category</option>
          {assignableCategories(categories).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}

export function ReviewItemCard({ item, view, actions }: ReviewItemCardProps): React.JSX.Element {
  const { categories, focused, always } = view;
  const { onFocus, onAlways, onPick } = actions;
  const { transaction } = item;
  const name = transactionName(transaction);
  const ring = focused
    ? 'border-[var(--color-accent)] shadow-[0_0_0_3px_var(--color-accent-glow)]'
    : '';

  return (
    <Card className={`ds-row gap-[14px] ${ring}`} onClick={onFocus}>
      <MerchantMark name={name} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">
          {name}{' '}
          <span className="ds-caption font-normal">
            {shortDate(transaction.postedDate)} · {transaction.accountName}
          </span>
        </div>
        {item.reasoning && <div className="ds-caption text-[12px]">{item.reasoning}</div>}
        <PickButtons item={item} name={name} categories={categories} onPick={onPick} />
      </div>
      <div className="text-right">
        <Money minor={transaction.amountMinor} direction className="text-[16px]" />
        <div className="ds-row mt-1.5 text-[11.5px] text-[var(--color-ink-muted)]">
          <Toggle checked={always} onChange={onAlways} label={`Always for ${name}`} />
          Always for {name}
        </div>
      </div>
    </Card>
  );
}
