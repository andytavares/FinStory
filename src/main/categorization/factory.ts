import { ClaudeClassifier } from './model';
import { OllamaClassifier } from './ollama';
import type { ModelClassifier } from './pipeline';

/**
 * Build the categorizer the user chose.
 *
 * Three modes, and the choice is theirs (FR-061):
 *  - anthropic: best accuracy; merchant descriptor, amount, date, and that
 *    merchant's own history leave the machine.
 *  - ollama: nothing leaves the machine; accuracy depends on the local model.
 *  - local_only: no model at all; merchant history alone, largest review queue.
 */

export type ModelProvider = 'anthropic' | 'ollama' | 'local_only';

/**
 * Default Anthropic model.
 *
 * Haiku by explicit user instruction. At this volume the cost difference across
 * tiers is under two dollars a month either way (research.md R4), so this is a
 * preference, not a cost decision — and it is user-changeable in settings.
 */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5';

export const ANTHROPIC_MODELS = [
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', note: 'Fastest, lowest cost' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', note: 'Balanced' },
  { id: 'claude-opus-5', label: 'Opus 5', note: 'Most capable' },
] as const;

export interface ClassifierConfig {
  readonly provider: ModelProvider;
  readonly taxonomy: string;
  readonly anthropicApiKey?: string | undefined;
  readonly anthropicModel?: string | undefined;
  readonly anthropicWorkspaceId?: string | undefined;
  readonly ollamaModel?: string | undefined;
  readonly ollamaBaseUrl?: string | undefined;
}

export interface BuiltClassifier {
  readonly classifier: ModelClassifier | null;
  /** True when no model stage is available; the pipeline runs local-only. */
  readonly localOnly: boolean;
  readonly reason: string;
}

export function buildClassifier(config: ClassifierConfig): BuiltClassifier {
  if (config.provider === 'local_only') {
    return {
      classifier: null,
      localOnly: true,
      reason: 'Categorizing from your own history only; nothing leaves this machine.',
    };
  }

  if (config.provider === 'ollama') {
    if (!config.ollamaModel) {
      return {
        classifier: null,
        localOnly: true,
        reason: 'No Ollama model selected, so categorization is using your history only.',
      };
    }
    return {
      classifier: new OllamaClassifier({
        model: config.ollamaModel,
        taxonomy: config.taxonomy,
        ...(config.ollamaBaseUrl ? { baseUrl: config.ollamaBaseUrl } : {}),
      }),
      localOnly: false,
      reason: `Categorizing locally with ${config.ollamaModel}; nothing leaves this machine.`,
    };
  }

  if (!config.anthropicApiKey) {
    return {
      classifier: null,
      localOnly: true,
      reason: 'No Anthropic API key set, so categorization is using your history only.',
    };
  }

  const model = config.anthropicModel ?? DEFAULT_ANTHROPIC_MODEL;
  return {
    classifier: new ClaudeClassifier({
      apiKey: config.anthropicApiKey,
      taxonomy: config.taxonomy,
      model,
      ...(config.anthropicWorkspaceId ? { workspaceId: config.anthropicWorkspaceId } : {}),
    }),
    localOnly: false,
    reason: `Categorizing with ${model} for merchants your history cannot resolve.`,
  };
}
