import { Card } from '../../components/ui';
import type { ModelProvider } from '@shared/types';

/** The options differ in one way that matters: what leaves this machine (FR-061). Full disclosure is the accessible description. */
const OPTIONS: ReadonlyArray<{
  id: ModelProvider;
  title: string;
  summary: string;
  disclosure: string;
}> = [
  {
    id: 'ollama',
    title: 'Ollama (local)',
    summary: 'Nothing leaves this Mac',
    disclosure:
      'Local model via Ollama. Nothing leaves this machine at all. Accuracy depends on the model you run; expect a larger review queue.',
  },
  {
    id: 'anthropic',
    title: 'Claude',
    summary: 'Most accurate',
    disclosure:
      'Best accuracy. Sends the merchant name, amount, date, and your category history for that one merchant. Never account numbers, balances, credentials, or totals.',
  },
  {
    id: 'local_only',
    title: 'History only',
    summary: 'No model',
    disclosure:
      'No model. Your own merchant history only. Fastest and most private, least accurate on merchants you have not seen before.',
  },
];

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
      <div role="radiogroup" aria-label="Who sorts new merchants" className="mt-2.5 grid grid-cols-3 gap-3.5">
        {OPTIONS.map((option) => (
          <Card
            key={option.id}
            role="radio"
            aria-checked={value === option.id}
            aria-labelledby={`provider-${option.id}-title`}
            aria-describedby={`provider-${option.id}-disclosure`}
            tabIndex={0}
            selected={value === option.id}
            className="cursor-pointer !px-3 !py-2.5"
            onClick={() => onChange(option.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onChange(option.id)}
          >
            <div id={`provider-${option.id}-title`} className="font-semibold">
              {option.title}
            </div>
            <div className="ds-caption">{option.summary}</div>
            <span id={`provider-${option.id}-disclosure`} hidden>
              {option.disclosure}
            </span>
          </Card>
        ))}
      </div>
    </Card>
  );
}
