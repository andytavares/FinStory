import { useState } from 'react';
import { useQuery } from '../lib/ipc';
import { PageHeader, Segmented } from '../components/ui';
import { assignableCategories } from '../components/TransactionEditor';
import { MerchantRulesTable } from './rules/MerchantRulesTable';
import { OneOffChanges } from './rules/OneOffChanges';
import { PrecedenceCard } from './rules/PrecedenceCard';
import type { MerchantRuleView, OverrideRecord } from '@shared/types';

type Tab = 'rules' | 'oneOffs';

/** Merchant rules and one-off changes: the two layers of user corrections. */
export function Overrides(): React.JSX.Element {
  const rules = useQuery<MerchantRuleView[]>('rules:list');
  const oneOffs = useQuery<OverrideRecord[]>('overrides:list');
  const categories = useQuery<Parameters<typeof assignableCategories>[0]>('categories:list');
  const [tab, setTab] = useState<Tab>('rules');

  const refetchBoth = (): void => {
    rules.refetch();
    oneOffs.refetch();
  };
  const loading = tab === 'rules' ? rules.loading && !rules.data : oneOffs.loading && !oneOffs.data;

  return (
    <div className="flex flex-col gap-[14px]">
      <PageHeader
        title="Rules and overrides"
        sub="Your choices. They win over every model and every guess."
      />
      <div>
        <Segmented<Tab>
          label="Rules view"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'rules', label: `Merchant rules · ${rules.data?.length ?? 0}` },
            { value: 'oneOffs', label: `One-off changes · ${oneOffs.data?.length ?? 0}` },
          ]}
        />
      </div>
      {loading ? (
        <p className="text-[var(--color-ink-faint)]">Loading…</p>
      ) : tab === 'rules' ? (
        <MerchantRulesTable
          rules={rules.data ?? []}
          choices={assignableCategories(categories.data ?? [])}
          onChanged={refetchBoth}
        />
      ) : (
        <OneOffChanges records={oneOffs.data ?? []} onChanged={refetchBoth} />
      )}
      <PrecedenceCard />
    </div>
  );
}
