import Anthropic from '@anthropic-ai/sdk';
import type { ModelClassifier, ModelInput, ModelResult } from './pipeline';

/**
 * Stage two: hosted classification.
 *
 * Reached only for merchants the local stage cannot resolve (research.md R4).
 *
 * What is transmitted, and nothing else (FR-061): merchant descriptor, amount,
 * timestamp, and the user's own prior category distribution FOR THAT MERCHANT.
 * Never credentials, account numbers, balances, other accounts' data, aggregate
 * totals, or cross-merchant history.
 */

const SYSTEM_PROMPT =
  'You categorize a single financial transaction into exactly one category from ' +
  'the provided taxonomy. Use the merchant, amount, day of week, and time of day, ' +
  'together with the user\'s own prior category distribution at this merchant. ' +
  'A merchant used for several purposes is common: weigh the amount and timing. ' +
  'When genuinely uncertain, return low confidence rather than guessing ' +
  'confidently — a flagged transaction is far better than a wrong one.';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    categoryId: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reasoning: { type: 'string' },
  },
  required: ['categoryId', 'confidence', 'reasoning'],
  additionalProperties: false,
} as const;

export interface ClaudeClassifierOptions {
  readonly apiKey: string;
  /** Default per the Anthropic reference; user-selectable (research.md R4). */
  readonly model?: string;
  /** Stable prefix — cached, so it must not vary per request. */
  readonly taxonomy: string;
}

/**
 * The COMPLETE outbound payload — this function is the FR-061 disclosure.
 *
 * Exported so the egress audit can assert against the real code path rather
 * than a copy of it. If anything is ever added here, the in-app disclosure and
 * the audit must change with it.
 */
export function renderOutboundPayload(input: ModelInput): string {
  const priors = Object.entries(input.priorDistribution);
  const total = priors.reduce((a, [, n]) => a + n, 0);
  const history =
    total === 0
      ? 'No prior purchases at this merchant.'
      : priors.map(([category, n]) => `${category}: ${Math.round((n / total) * 100)}%`).join(', ');

  return [
    `Merchant: ${input.descriptor}`,
    `Amount: ${(Math.abs(input.amountMinor) / 100).toFixed(2)}`,
    `When: ${input.occurredAt.toUTCString()}`,
    `Your history at this merchant: ${history}`,
  ].join('\n');
}

export class ClaudeClassifier implements ModelClassifier {
  readonly #client: Anthropic;
  readonly #model: string;
  readonly #taxonomy: string;

  constructor(options: ClaudeClassifierOptions) {
    this.#client = new Anthropic({ apiKey: options.apiKey });
    this.#model = options.model ?? 'claude-opus-5';
    this.#taxonomy = options.taxonomy;
  }

  async classify(input: ModelInput): Promise<ModelResult> {
    const response = await this.#client.messages.create({
      model: this.#model,
      max_tokens: 1024,
      // Narrow classification: adaptive thinking at low effort. budget_tokens is
      // rejected with a 400 on Opus 5 and must never be sent.
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
      },
      system: [
        {
          type: 'text',
          text: `${SYSTEM_PROMPT}\n\nTaxonomy:\n${this.#taxonomy}`,
          // Stable prefix cached; volatile per-transaction content goes after.
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: renderOutboundPayload(input) }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    return this.#parse(response);
  }

  #parse(response: Anthropic.Message): ModelResult {
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') {
      throw new Error('Categorization response contained no text block');
    }
    // Always parse; never string-match a serialized tool input.
    const parsed: unknown = JSON.parse(block.text);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as ModelResult).categoryId !== 'string'
    ) {
      throw new Error('Categorization response did not match the expected schema');
    }
    const result = parsed as ModelResult;
    return {
      categoryId: result.categoryId,
      confidence: Math.max(0, Math.min(1, result.confidence)),
      reasoning: result.reasoning,
    };
  }
}
