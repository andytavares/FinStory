import { useState } from 'react';
import { call } from '../../lib/ipc';
import { Button, Card, Chip, MerchantMark, Table } from '../../components/ui';
import { EmptyState } from '../../components/EmptyState';
import { categoryColor } from '../../lib/categoryColor';
import { RuleEditor, type CategoryChoice } from './RuleEditor';
import type { MerchantRuleView } from '@shared/types';

function RuleRow({
  rule,
  onEdit,
  onRemove,
}: {
  rule: MerchantRuleView;
  onEdit: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <tr>
      <td>
        <div className="ds-row">
          <MerchantMark name={rule.displayName ?? rule.merchantName} />
          <span className="ds-num ds-muted text-[11.5px]">{rule.merchantName}</span>
        </div>
      </td>
      <td>{rule.displayName ?? '—'}</td>
      <td>
        {rule.categoryName ? (
          <Chip dot={categoryColor(rule.categoryId ?? rule.categoryName)}>{rule.categoryName}</Chip>
        ) : (
          <span className="ds-faint">—</span>
        )}
      </td>
      <td className="ds-muted">{rule.transactionCount} charges · past and future</td>
      <td>
        {rule.oneOffCount > 0 ? (
          <Chip tone="accent">{rule.oneOffCount} one-off</Chip>
        ) : (
          <span className="ds-faint">None</span>
        )}
      </td>
      <td className="r">
        <span className="inline-flex gap-1.5">
          <Button size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>
            Remove
          </Button>
        </span>
      </td>
    </tr>
  );
}

export function MerchantRulesTable({
  rules,
  choices,
  onChanged,
}: {
  rules: readonly MerchantRuleView[];
  choices: CategoryChoice;
  onChanged: () => void;
}): React.JSX.Element {
  const [editing, setEditing] = useState<string | null>(null);

  if (rules.length === 0) {
    return (
      <EmptyState
        title="No merchant rules yet"
        detail="Choose All when you edit a transaction to make a rule for that merchant."
      />
    );
  }

  const finish = (): void => {
    setEditing(null);
    onChanged();
  };
  const remove = async (rule: MerchantRuleView): Promise<void> => {
    await call('rules:delete', { merchantKey: rule.merchantKey });
    onChanged();
  };

  return (
    <Card className="!px-1.5 !py-0">
      <Table>
        <thead>
          <tr>
            <th>Merchant</th>
            <th>Name shown</th>
            <th>Category</th>
            <th>Applies to</th>
            <th>Exceptions</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) =>
            editing === rule.merchantKey ? (
              <tr key={rule.merchantKey}>
                <td colSpan={6}>
                  <RuleEditor rule={rule} choices={choices} onDone={finish} />
                </td>
              </tr>
            ) : (
              <RuleRow
                key={rule.merchantKey}
                rule={rule}
                onEdit={() => setEditing(rule.merchantKey)}
                onRemove={() => void remove(rule)}
              />
            ),
          )}
        </tbody>
      </Table>
    </Card>
  );
}
