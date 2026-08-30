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
    const response = await fetch(`${this.#baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.options.model,
        stream: false,
        format: RESPONSE_SCHEMA,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT}\n\nTaxonomy:\n${this.options.taxonomy}` },
          // Identical payload to the hosted path, so switching providers cannot
          // change what a transaction looks like to the model.
          { role: 'user', content: renderOutboundPayload(input) },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}. Is it running at ${this.#baseUrl}?`);
    }

    const body = (await response.json()) as { message?: { content?: string } };
    const content = body.message?.content;
    if (!content) throw new Error('Ollama response contained no message content');

    // Shared parser: same validation, clamping, and failure behaviour as hosted.
    return parseModelResponse({ content: [{ type: 'text', text: content }] });
  }
}

export interface OllamaModel {
  readonly name: string;
  readonly sizeBytes: number;
}

/** List models installed locally, for the settings picker. */
export async function listOllamaModels(baseUrl = DEFAULT_OLLAMA_URL): Promise<OllamaModel[]> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`);
  if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
  const body = (await response.json()) as { models?: Array<{ name: string; size: number }> };
  return (body.models ?? []).map((m) => ({ name: m.name, sizeBytes: m.size }));
}
