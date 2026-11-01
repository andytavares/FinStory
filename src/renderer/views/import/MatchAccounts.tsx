import { useState } from 'react';
import { Button, Card, Chip, Eyebrow, Select } from '../../components/ui';
import type { ImportPreview } from '@shared/types';
import { CategoryMapping, type MoneyCategory } from './CategoryMapping';
import { plural } from './format';

export interface MoneyAccountOption {
  readonly id: string;
  readonly label: string;
}

interface MatchAccountsProps {
  readonly preview: ImportPreview;
  readonly options: readonly MoneyAccountOption[];
  readonly categories: readonly MoneyCategory[];
  readonly accountChoice: Readonly<Record<string, string>>;
  readonly categoryChoice: Readonly<Record<string, string>>;
  readonly busy: boolean;
  readonly onAccount: (label: string, accountId: string) => void;
  readonly onCategory: (quickenCategory: string, categoryId: string) => void;
  readonly onBack: () => void;
  readonly onCheck: () => void;
}

function accountNote(account: ImportPreview['accounts'][number], isNew: boolean): string {
  if (isNew) return 'Not day-to-day';
  return account.duplicateCount > 0 ? `${account.duplicateCount} already imported, will skip` : 'Added to this account';
}

export function MatchAccounts(props: MatchAccountsProps): React.JSX.Element {
  const { preview, options, accountChoice, categoryChoice } = props;
  const [mappingOpen, setMappingOpen] = useState(false);
  const mapped = new Set(Object.values(categoryChoice).filter(Boolean)).size;
  return (
    <Card>
      <Eyebrow>Match accounts</Eyebrow>
      <div>
        {preview.accounts.map((account, index) => {
          const choice = accountChoice[account.label] ?? 'new';
          return (
            <div
              key={account.label}
              className="ds-row"
              style={{
                gap: 12,
                padding: '10px 0',
                borderBottom: index === preview.accounts.length - 1 ? 0 : '1px solid var(--color-line)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div className="ds-num" style={{ fontSize: 12, textTransform: 'uppercase' }}>{account.label}</div>
                <div className="ds-faint" style={{ fontSize: 11.5 }}>
                  {plural(account.count, 'transaction')} · {accountNote(account, choice === 'new')}
                </div>
              </div>
              <span className="ds-faint">→</span>
              <Select
                aria-label={`Money account for ${account.label}`}
                style={{ width: 220 }}
                value={choice}
                onChange={(e) => props.onAccount(account.label, e.target.value)}
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
                <option value="new">New account: {account.label}</option>
              </Select>
            </div>
          );
        })}
      </div>
      <div className="ds-row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <Chip tone="ok">{preview.newCount.toLocaleString('en-US')} new</Chip>
        <Chip>{preview.duplicateCount.toLocaleString('en-US')} duplicates skipped</Chip>
        {preview.categoryMappings.length > 0 && (
          <button
            type="button"
            aria-expanded={mappingOpen}
            style={{ cursor: 'pointer' }}
            onClick={() => setMappingOpen(!mappingOpen)}
          >
            <Chip tone="accent">Your Quicken categories → mapped to {mapped} Money categories</Chip>
          </button>
        )}
      </div>
      {mappingOpen && (
        <div style={{ marginTop: 10 }}>
          <CategoryMapping
            mappings={preview.categoryMappings}
            categories={props.categories}
            choice={categoryChoice}
            onChoose={props.onCategory}
          />
        </div>
      )}
      <div className="ds-row" style={{ marginTop: 14 }}>
        <Button variant="ghost" onClick={props.onBack}>Back</Button>
        <Button variant="primary" disabled={props.busy || preview.newCount === 0} onClick={props.onCheck} style={{ marginLeft: 'auto' }}>
          Check {preview.newCount.toLocaleString('en-US')} transactions
        </Button>
      </div>
    </Card>
  );
}
