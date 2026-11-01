import { Field, Select, TextInput } from '../../components/ui';
import type { Query } from '../../lib/ipc';
import type { AppSettings } from '@shared/types';

const ANTHROPIC_MODELS = [
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', note: 'Fastest, lowest cost' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', note: 'Balanced' },
  { id: 'claude-opus-5', label: 'Opus 5', note: 'Most accurate' },
];

export interface OllamaModel {
  readonly name: string;
}

interface FieldsProps {
  readonly settings: AppSettings;
  readonly update: (patch: Record<string, string>) => void;
}

export function ClaudeFields({ settings, update }: FieldsProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Model">
        <Select
          defaultValue={settings.anthropicModel}
          onChange={(e) => update({ anthropicModel: e.target.value })}
        >
          {ANTHROPIC_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.note}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Workspace ID">
        <TextInput
          defaultValue={settings.anthropicWorkspaceId}
          onChange={(e) => update({ anthropicWorkspaceId: e.target.value.trim() })}
          placeholder="Leave empty unless your key requires one"
          aria-label="Anthropic workspace ID"
        />
      </Field>
      <p className="ds-caption col-span-2">
        Only identity-linked keys need the workspace ID. If yours does, requests fail with
        &ldquo;anthropic-workspace-id is required&rdquo; until it is set. Find it in the Anthropic
        Console URL when your workspace is open.
      </p>
    </div>
  );
}

function modelPlaceholder(models: Query<OllamaModel[]>): string {
  if (models.loading) return 'Loading models…';
  return models.error ? 'Not available' : 'No local models found';
}

export function OllamaFields({
  settings,
  update,
  models,
}: FieldsProps & { models: Query<OllamaModel[]> }): React.JSX.Element {
  const installed = models.data ?? [];
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Ollama address">
        <TextInput
          className="ds-num"
          defaultValue={settings.ollamaBaseUrl}
          onChange={(e) => update({ ollamaBaseUrl: e.target.value.trim() })}
          placeholder="http://localhost:11434"
          aria-label="Ollama address"
        />
      </Field>
      <Field label="Model">
        <span className="sr-only">Installed model</span>
        <div className="relative flex flex-col">
          <Select
            disabled={installed.length === 0}
            defaultValue={settings.ollamaModel}
            onChange={(e) => update({ ollamaModel: e.target.value })}
          >
            {installed.length === 0 ? (
              <option value="">{modelPlaceholder(models)}</option>
            ) : (
              <>
                <option value="">Choose a model</option>
                {installed.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </>
            )}
          </Select>
          {installed.length > 0 && (
            <span className="ds-caption pointer-events-none absolute right-7 top-1/2 -translate-y-1/2">
              {installed.length} chat models
            </span>
          )}
        </div>
      </Field>
    </div>
  );
}
