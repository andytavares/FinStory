import { Card } from '../../components/ui';
import type { ModelProvider } from '@shared/types';

/**
 * The three options differ in exactly one way that matters: what leaves this
 * machine (FR-061). The full disclosure sits in each option for screen readers.
 */
const OPTIONS: ReadonlyArray<{
  id: ModelProvider;
  title: string;
  summary: string;
  disclosure: string;
  order: number;
}> = [
  {
    id: 'anthropic',
    title: 'Claude',
    summary: 'Most accurate',
    disclosure:
      'Best accuracy. Sends the merchant name, amount, date, and your category history for that one merchant. Never account numbers, balances, credentials, or totals.',
    order: 2,
  },
  {
    id: 'ollama',
    title: 'Ollama (local)',
    summary: 'Nothing leaves this Mac',
    disclosure:
      'Local model via Ollama. Nothing leaves this machine at all. Accuracy depends on the model you run; expect a larger review queue.',
    order: 1,
  },
  {
    id: 'local_only',
    title: 'History only',
    summary: 'No model',
    disclosure:
      'No model. Your own merchant history only. Fastest and most private, least accurate on merchants you have not seen before.',
    order: 3,
  },
];

const SELECTED_RING =
  'border-[var(--color-accent)] shadow-[0_0_0_3px_var(--color-accent-glow)]';

export function ProviderChoice({
  value,
  onChange,
}: {
  value: ModelProvider;
  onChange: (next: ModelProvider) => void;
}): React.JSX.Element {
  return (
    <Card title="Who sorts new merchants">
      <p className="ds-caption -mt-0.5">Your rules and corrections always come first.</p>
      <div className="mt-2.5 grid grid-cols-3 gap-3.5">
        {OPTIONS.map((option) => (
          <label key={option.id} className="relative cursor-pointer" style={{ order: option.order }}>
            <input
              type="radio"
              name="modelProvider"
              className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
              checked={value === option.id}
              onChange={() => onChange(option.id)}
            />
            <Card
              className={`!px-3 !py-2.5 peer-focus-visible:shadow-[0_0_0_3px_var(--color-accent-glow)] ${
                value === option.id ? SELECTED_RING : ''
              }`}
            >
              <div className="font-semibold">{option.title}</div>
              <div className="ds-caption">{option.summary}</div>
              <span className="sr-only">{option.disclosure}</span>
            </Card>
          </label>
        ))}
      </div>
    </Card>
  );
}
