import { describe, it, expect } from 'vitest';
import { renderOutboundPayload, parseModelResponse, ClaudeClassifier } from '@main/categorization/model';

const input = {
  merchantKey: 'target',
  descriptor: 'TARGET 00023415',
  amountMinor: -4782,
  occurredAt: new Date('2026-08-29T14:34:00Z'),
  priorDistribution: { groceries: 60, home: 40 },
};

const textBlock = (text: string) => ({ content: [{ type: 'text', text }] });

describe('outbound payload (FR-061)', () => {
  it('contains exactly the four disclosed lines and nothing more', () => {
    expect(renderOutboundPayload(input).split('\n')).toHaveLength(4);
  });

  it('renders history as percentages for this merchant only', () => {
    const p = renderOutboundPayload(input);
    expect(p).toContain('groceries: 60%');
    expect(p).toContain('home: 40%');
  });

  it('states absent history rather than omitting the line', () => {
    expect(renderOutboundPayload({ ...input, priorDistribution: {} })).toContain(
      'No prior purchases at this merchant.',
    );
  });

  it('sends the amount as a magnitude', () => {
    expect(renderOutboundPayload(input)).toContain('Amount: 47.82');
  });
});

describe('response parsing accepts well-formed replies', () => {
  it('returns the parsed classification', () => {
    const r = parseModelResponse(
      textBlock('{"categoryId":"groceries","confidence":0.87,"reasoning":"weekend, mid amount"}'),
    );
    expect(r).toEqual({
      categoryId: 'groceries',
      confidence: 0.87,
      reasoning: 'weekend, mid amount',
    });
  });

  it('defaults missing reasoning to empty rather than failing', () => {
    expect(parseModelResponse(textBlock('{"categoryId":"dining","confidence":0.9}')).reasoning).toBe('');
  });

  it('clamps an out-of-range confidence', () => {
    // A model returning 1.4 must not defeat the review threshold.
    expect(parseModelResponse(textBlock('{"categoryId":"x","confidence":1.4}')).confidence).toBe(1);
    expect(parseModelResponse(textBlock('{"categoryId":"x","confidence":-2}')).confidence).toBe(0);
  });

  it('parses escaped JSON rather than string-matching it', () => {
    const r = parseModelResponse(
      textBlock('{"categoryId":"home","confidence":0.8,"reasoning":"a \\"quoted\\" note"}'),
    );
    expect(r.reasoning).toBe('a "quoted" note');
  });

  it('ignores non-text blocks and finds the text one', () => {
    const r = parseModelResponse({
      content: [
        { type: 'thinking' },
        { type: 'text', text: '{"categoryId":"dining","confidence":0.5}' },
      ],
    });
    expect(r.categoryId).toBe('dining');
  });
});

describe('response parsing rejects malformed replies rather than guessing', () => {
  it('throws when there is no text block', () => {
    expect(() => parseModelResponse({ content: [] })).toThrow(/no text block/i);
  });

  it('throws when the text block is empty', () => {
    expect(() => parseModelResponse(textBlock(''))).toThrow(/no text block/i);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseModelResponse(textBlock('not json at all'))).toThrow(/not valid JSON/i);
  });

  it('throws when the payload is not an object', () => {
    expect(() => parseModelResponse(textBlock('"a string"'))).toThrow(/expected schema/i);
    expect(() => parseModelResponse(textBlock('null'))).toThrow(/expected schema/i);
  });

  it('throws when categoryId is missing or not a string', () => {
    expect(() => parseModelResponse(textBlock('{"confidence":0.9}'))).toThrow(/expected schema/i);
    expect(() => parseModelResponse(textBlock('{"categoryId":42,"confidence":0.9}'))).toThrow(
      /expected schema/i,
    );
  });

  it('throws on an empty categoryId — an empty category is not a category', () => {
    expect(() => parseModelResponse(textBlock('{"categoryId":"","confidence":0.9}'))).toThrow(
      /expected schema/i,
    );
  });

  it('throws when confidence is missing or not a number', () => {
    expect(() => parseModelResponse(textBlock('{"categoryId":"x"}'))).toThrow(/expected schema/i);
    expect(() => parseModelResponse(textBlock('{"categoryId":"x","confidence":"high"}'))).toThrow(
      /expected schema/i,
    );
  });
});

describe('classifier construction', () => {
  it('constructs with the documented default model', () => {
    expect(new ClaudeClassifier({ apiKey: 'k', taxonomy: 't' })).toBeInstanceOf(ClaudeClassifier);
  });

  it('accepts a model override, since the model is user-selectable (R4)', () => {
    expect(
      new ClaudeClassifier({ apiKey: 'k', taxonomy: 't', model: 'claude-haiku-4-5' }),
    ).toBeInstanceOf(ClaudeClassifier);
  });
});
