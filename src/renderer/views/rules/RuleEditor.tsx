import { useState } from 'react';
import { call } from '../../lib/ipc';
import { Button, Select, TextInput } from '../../components/ui';
import type { MerchantRuleView } from '@shared/types';

export type CategoryChoice = ReadonlyArray<{ id: string; label: string }>;

export function RuleEditor({
  rule,
  choices,
  onDone,
}: {
  rule: MerchantRuleView;
  choices: CategoryChoice;
  onDone: () => void;
}): React.JSX.Element {
  const [name, setName] = useState(rule.displayName ?? '');
  const [categoryId, setCategoryId] = useState(rule.categoryId ?? '');

  const save = async (): Promise<void> => {
    await call('rules:update', {
      merchantKey: rule.merchantKey,
      displayName: name.trim() || null,
      ...(categoryId !== (rule.categoryId ?? '') && { categoryId: categoryId || null }),
    });
    onDone();
  };

  return (
    <div className="ds-row flex-wrap">
      <TextInput
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={rule.merchantName}
        aria-label={`Name for ${rule.merchantName}`}
      />
      <Select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        aria-label={`Category for ${rule.merchantName}`}
      >
        <option value="">No category rule</option>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </Select>
      <Button variant="primary" size="sm" onClick={() => void save()}>
        Save
      </Button>
      <Button size="sm" onClick={onDone}>
        Cancel
      </Button>
    </div>
  );
}
