import { useEffect, useState } from 'react';
import { call } from '../../lib/ipc';
import { Button, Card, Chip, Eyebrow, Field, Select, TextInput } from '../../components/ui';
import type { ChipTone } from '../../components/ui';
import type { OllamaDetection } from '@shared/types';

export type SortProvider = 'ollama' | 'anthropic' | 'local_only';

export interface SortChoice {
  readonly provider: SortProvider | null;
  readonly model: string;
  readonly anthropicKey: string;
}

interface OptionContent {
  readonly title: string;
  readonly detail: string;
  readonly chip: { tone: ChipTone; text: string };
}

interface OptionCardProps {
  readonly option: OptionContent;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

function OptionCard({ option, selected, onSelect }: OptionCardProps): React.JSX.Element {
  const { title, detail, chip } = option;
  return (
    <Card
      role="radio"
      aria-checked={selected}
      aria-label={title}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect()}
      className="ds-row cursor-pointer !items-start"
      selected={selected}
    >
      <span
        className="mt-0.5 grid h-4 w-4 place-items-center rounded-full border-2"
        style={{ borderColor: selected ? 'var(--color-accent)' : 'var(--color-line-strong)' }}
      >
        {selected && <i className="block h-[7px] w-[7px] rounded-full bg-[var(--color-accent)]" />}
      </span>
      <div style={{ flex: 1 }}>
        <div className="font-semibold">{title}</div>
        <div className="ds-faint text-[12px]">{detail}</div>
      </div>
      <Chip tone={chip.tone}>{chip.text}</Chip>
    </Card>
  );
}

/** Ask the main process whether Ollama is running; a failed lookup counts as not running. */
function useOllama(): OllamaDetection | null {
  const [detection, setDetection] = useState<OllamaDetection | null>(null);
  useEffect(() => {
    let cancelled = false;
    call<OllamaDetection>('setup:detectOllama')
      .catch(() => ({ running: false, models: [] }))
      .then((found) => !cancelled && setDetection(found));
    return () => {
      cancelled = true;
    };
  }, []);
  return detection;
}

interface ModelTest {
  readonly testing: boolean;
  readonly testMessage: string | null;
  readonly test: () => Promise<void>;
}

/** Point the settings at Ollama with `model`, then run the sample-charge test. */
function useModelTest(model: string): ModelTest {
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const test = async (): Promise<void> => {
    setTesting(true);
    try {
      await call('settings:update', { modelProvider: 'ollama', ollamaModel: model });
      setTestMessage((await call<{ message: string }>('model:test')).message);
    } catch (e) {
      setTestMessage((e as { message?: string }).message ?? 'The test did not run');
    } finally {
      setTesting(false);
    }
  };
  return { testing, testMessage, test };
}

function ollamaChip(ollama: OllamaDetection | null): OptionContent['chip'] {
  if (ollama?.running) return { tone: 'ok', text: 'Connected' };
  return { tone: 'neutral', text: ollama ? 'Not running' : 'Looking…' };
}

function ollamaOption(ollama: OllamaDetection | null): OptionContent {
  const withModel = ollama?.models[0] ? ' with ' + ollama.models[0] : '';
  const detail = ollama?.running
    ? `Nothing leaves this Mac. Found Ollama running${withModel}.`
    : 'Nothing leaves this Mac. Install and start Ollama to use it.';
  return { title: 'Local model with Ollama', detail, chip: ollamaChip(ollama) };
}

interface ProviderOptionsProps {
  readonly provider: SortProvider;
  readonly ollama: OllamaDetection | null;
  readonly onPick: (next: SortProvider) => void;
}

function ProviderOptions({ provider, ollama, onPick }: ProviderOptionsProps): React.JSX.Element {
  return (
    <div role="radiogroup" aria-label="Sorting method" className="grid gap-[14px]">
      <OptionCard
        option={ollamaOption(ollama)}
        selected={provider === 'ollama'}
        onSelect={() => onPick('ollama')}
      />
      <OptionCard
        option={{
          title: 'Claude',
          detail:
            'Most accurate. Sends the merchant name, amount, date and your category history for that one merchant — never account numbers, balances, credentials, or totals.',
          chip: { tone: 'accent', text: 'Needs API key' },
        }}
        selected={provider === 'anthropic'}
        onSelect={() => onPick('anthropic')}
      />
      <OptionCard
        option={{
          title: 'Your history only',
          detail: 'No model. More items land in Review.',
          chip: { tone: 'neutral', text: 'Always available' },
        }}
        selected={provider === 'local_only'}
        onSelect={() => onPick('local_only')}
      />
    </div>
  );
}

interface SortStepProps {
  readonly sort: { readonly choice: SortChoice; readonly onChange: (next: SortChoice) => void };
  readonly onBack: () => void;
  readonly onNext: () => void;
}

export function SortStep({ sort, onBack, onNext }: SortStepProps): React.JSX.Element {
  const { choice, onChange } = sort;
  const ollama = useOllama();
  const provider = choice.provider ?? (ollama?.running ? 'ollama' : 'local_only');
  const model = choice.model || ollama?.models[0] || '';
  const pick = (next: SortProvider): void => onChange({ ...choice, provider: next, model });

  const { testing, testMessage, test } = useModelTest(model);

  return (
    <>
      <Eyebrow>Step 2 of 4</Eyebrow>
      <h2 className="m-0 text-[21px] font-semibold">How should Money sort your transactions?</h2>
      <p className="ds-faint m-0">
        Your own corrections always win. This only decides who guesses for merchants Money has not
        seen.
      </p>
      <ProviderOptions provider={provider} ollama={ollama} onPick={pick} />
      {provider === 'ollama' && ollama?.running && (
        <div className="max-w-[320px]">
          <Field label="Model">
            <Select
              aria-label="Model"
              value={model}
              onChange={(e) => onChange({ ...choice, provider, model: e.target.value })}
            >
              {ollama.models.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      {provider === 'anthropic' && (
        <div className="max-w-[320px]">
          <Field label="Anthropic API key">
            <TextInput
              type="password"
              placeholder="sk-ant-..."
              value={choice.anthropicKey}
              onChange={(e) => onChange({ ...choice, provider, anthropicKey: e.target.value })}
            />
          </Field>
        </div>
      )}
      {testMessage && <p className="ds-muted m-0">{testMessage}</p>}
      <div className="ds-row mt-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button disabled={provider !== 'ollama' || !model || testing} onClick={() => void test()}>
          Test with 3 sample charges
        </Button>
        <Button variant="primary" className="ml-auto" onClick={onNext}>
          Continue
        </Button>
      </div>
    </>
  );
}
