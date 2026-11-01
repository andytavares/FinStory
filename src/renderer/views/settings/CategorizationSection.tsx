import { useState } from 'react';
import { useQuery, call, type Query } from '../../lib/ipc';
import { RecategorizeButton } from '../../components/RecategorizeButton';
import { Button, Card, Chip } from '../../components/ui';
import { ProviderChoice } from './ProviderChoice';
import { ClaudeFields, OllamaFields, type OllamaModel } from './ProviderFields';
import type { AppSettings } from '@shared/types';

const update = (patch: Record<string, string>): void => {
  void call('settings:update', patch);
};

/** Where categorization runs, with which model, and the way to re-run it. */
export function CategorizationSection({ settings }: { settings: AppSettings }): React.JSX.Element {
  const [provider, setProvider] = useState(settings.modelProvider);
  const models = useQuery<OllamaModel[]>('models:listOllama');
  const [note, setNote] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const choose = (next: AppSettings['modelProvider']): void => {
    setProvider(next);
    update({ modelProvider: next });
  };

  /**
   * Categorization falls back to local heuristics on any model error, so a bad
   * key looks like a good one. This calls the model for real and prints the answer.
   */
  const test = async (): Promise<void> => {
    setTesting(true);
    setNote(null);
    try {
      setNote((await call<{ message: string }>('model:test')).message);
    } catch (e) {
      setNote((e as { message?: string }).message ?? 'The check itself failed.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <ProviderChoice value={provider} onChange={choose} />
      <Card>
        {provider === 'anthropic' && <ClaudeFields settings={settings} update={update} />}
        {provider === 'ollama' && <OllamaFields settings={settings} update={update} models={models} />}
        <div className="ds-row mt-3 flex-wrap">
          {provider === 'ollama' && <OllamaStatus models={models} />}
          {note && (
            <span role="status">
              <Chip>Last test: {note}</Chip>
            </span>
          )}
          <span className="ml-auto flex gap-2">
            {provider === 'ollama' && (
              <Button size="sm" onClick={models.refetch}>
                Refresh models
              </Button>
            )}
            <Button size="sm" variant="primary" disabled={testing} onClick={() => void test()}>
              {testing ? 'Checking…' : 'Test the model'}
            </Button>
          </span>
        </div>
      </Card>
      <Card>
        <div className="ds-row">
          <div className="flex-1">
            <div className="font-semibold">Sort again with the current model</div>
            <div className="ds-caption">Your own changes are never touched.</div>
          </div>
          <RecategorizeButton />
        </div>
      </Card>
    </>
  );
}

function OllamaStatus({ models }: { models: Query<OllamaModel[]> }): React.JSX.Element {
  if (models.loading) return <Chip>Checking Ollama…</Chip>;
  if (models.error) return <Chip tone="bad">{models.error}</Chip>;
  return <Chip tone="ok" dot="var(--color-positive)">Ollama running</Chip>;
}
