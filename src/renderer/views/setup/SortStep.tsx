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

function OptionCard({
  title,
  detail,
  chip,
  selected,
  onSelect,
}: {
  title: string;
  detail: string;
  chip: { tone: ChipTone; text: string };
  selected: boolean;
  onSelect: () => void;
}): React.JSX.Element {
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

export function SortStep({
  choice,
  onChange,
  onBack,
  onNext,
}: {
  choice: SortChoice;
  onChange: (next: SortChoice) => void;
  onBack: () => void;
  onNext: () => void;
}): React.JSX.Element {
  const ollama = useOllama();
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const provider = choice.provider ?? (ollama?.running ? 'ollama' : 'local_only');
  const model = choice.model || ollama?.models[0] || '';
  const pick = (next: SortProvider): void => onChange({ ...choice, provider: next, model });

  const test = async (): Promise<void> => {
    setTesting(true);
    try {
      await call('settings:update', { modelProvider: 'ollama', ollamaModel: model });
      setTestMessage(((await call<{ message: string }>('model:test')).message));
    } catch (e) {
      setTestMessage((e as { message?: string }).message ?? 'The test did not run');
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <Eyebrow>Step 2 of 4</Eyebrow>
      <h2 className="m-0 text-[21px] font-semibold">How should Money sort your transactions?</h2>
      <p className="ds-faint m-0">
        Your own corrections always win. This only decides who guesses for merchants Money has not
        seen.
      </p>
      <div role="radiogroup" aria-label="Sorting method" className="grid gap-[14px]">
        <OptionCard
          title="Local model with Ollama"
          detail={
            ollama?.running
              ? `Nothing leaves this Mac. Found Ollama running${ollama.models[0] ? ` with ${ollama.models[0]}` : ''}.`
              : 'Nothing leaves this Mac. Install and start Ollama to use it.'
          }
          chip={ollama?.running ? { tone: 'ok', text: 'Connected' } : { tone: 'neutral', text: ollama ? 'Not running' : 'Looking…' }}
          selected={provider === 'ollama'}
          onSelect={() => pick('ollama')}
        />
        <OptionCard
          title="Claude"
          detail="Most accurate. Sends the merchant name, amount, date and your category history for that one merchant — never account numbers, balances, credentials, or totals."
          chip={{ tone: 'accent', text: 'Needs API key' }}
          selected={provider === 'anthropic'}
          onSelect={() => pick('anthropic')}
        />
        <OptionCard
          title="Your history only"
          detail="No model. More items land in Review."
          chip={{ tone: 'neutral', text: 'Always available' }}
          selected={provider === 'local_only'}
          onSelect={() => pick('local_only')}
        />
      </div>
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
