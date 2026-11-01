import type { ModelClassifier, ModelInput, ModelResult } from './pipeline';
import { renderOutboundPayload } from './model';
import { parseModelResponse } from './model';

/**
 * Local categorization via Ollama.
 *
 * The privacy-maximal option: nothing leaves the machine at all, not even the
 * merchant descriptor. Accuracy depends entirely on the local model, so the
 * confidence threshold does more work here and the review queue will be larger
 * (research.md R4).
 *
 * Uses /api/chat with a JSON schema in `format`, which is Ollama's structured
 * output mechanism — the same contract the hosted path uses, so the parser is
 * shared.
 */

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    categoryId: { type: 'string' },
    confidence: { type: 'number' },
    reasoning: { type: 'string' },
  },
  required: ['categoryId', 'confidence', 'reasoning'],
} as const;

const SYSTEM_PROMPT =
  'You categorize a single financial transaction into exactly one category id ' +
  'from the provided taxonomy. Use the merchant, amount, day and time, and the ' +
  "user's own prior category distribution at this merchant. Respond with JSON " +
  'only. When uncertain, return a low confidence rather than guessing — a ' +
  'flagged transaction is far better than a wrong one.';

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

export interface OllamaOptions {
  readonly model: string;
  readonly taxonomy: string;
  readonly baseUrl?: string;
}

export class OllamaClassifier implements ModelClassifier {
  readonly #baseUrl: string;

  constructor(private readonly options: OllamaOptions) {
    this.#baseUrl = (options.baseUrl ?? DEFAULT_OLLAMA_URL).replace(/\/$/, '');
  }

  async classify(input: ModelInput): Promise<ModelResult> {
    const response = await ollamaFetch(this.#baseUrl, '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.options.model,
        stream: false,
        // Thinking models (qwen3) otherwise spend 15-50 s reasoning per transaction.
        think: false,
        options: { num_ctx: 4096 },
        format: RESPONSE_SCHEMA,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\nTaxonomy:\n${this.options.taxonomy}` },
          // Identical payload to the hosted path, so switching providers cannot
          // change what a transaction looks like to the model.
          { role: 'user', content: renderOutboundPayload(input) },
        ],
      }),
    });

    const body = (await response.json()) as { message?: { content?: string } };
    const content = body.message?.content;
    if (!content) throw new Error('Ollama response contained no message content');

    // Shared parser: same validation, clamping, and failure behaviour as hosted.
    return parseModelResponse({ content: [{ type: 'text', text: content }] });
  }
}

/** fetch that turns a refused connection or an error response into a readable message. */
async function ollamaFetch(baseUrl: string, path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, init);
  } catch {
    throw new Error(`Ollama is not running at ${baseUrl}. Start Ollama and try again.`);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(`Ollama: ${body?.error ?? `returned ${response.status}`}`);
  }
  return response;
}

export interface OllamaModel {
  readonly name: string;
  readonly sizeBytes: number;
}

/** List models that can chat, for the settings picker. Embedding-only models are left out. */
export async function listOllamaModels(
  baseUrl = DEFAULT_OLLAMA_URL,
  signal?: AbortSignal,
): Promise<OllamaModel[]> {
  const response = await ollamaFetch(baseUrl.replace(/\/$/, ''), '/api/tags', signal ? { signal } : undefined);
  const body = (await response.json()) as {
    models?: Array<{ name: string; size: number; capabilities?: string[] }>;
  };
  return (body.models ?? [])
    .filter((m) => !m.capabilities || m.capabilities.includes('completion'))
    .map((m) => ({ name: m.name, sizeBytes: m.size }));
}

export interface OllamaDetection {
  readonly running: boolean;
  readonly version?: string;
  readonly models: string[];
}

const DETECT_TIMEOUT_MS = 2000;

/** Asks a local Ollama who it is. Never throws and never waits longer than the timeout. */
export async function detectOllama(
  baseUrl = DEFAULT_OLLAMA_URL,
  timeoutMs = DETECT_TIMEOUT_MS,
): Promise<OllamaDetection> {
  const signal = AbortSignal.timeout(timeoutMs);
  const base = baseUrl.replace(/\/$/, '');
  try {
    const [versionResponse, models] = await Promise.all([
      ollamaFetch(base, '/api/version', { signal }),
      listOllamaModels(base, signal),
    ]);
    const { version } = (await versionResponse.json()) as { version?: string };
    return { running: true, ...(version ? { version } : {}), models: models.map((m) => m.name) };
  } catch {
    return { running: false, models: [] };
  }
}
