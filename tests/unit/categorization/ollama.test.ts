import { describe, it, expect, vi, afterEach } from 'vitest';
import { OllamaClassifier, listOllamaModels, DEFAULT_OLLAMA_URL } from '@main/categorization/ollama';

const input = {
  merchantKey: 'target',
  descriptor: 'TARGET 00023415',
  amountMinor: -4782,
  occurredAt: new Date('2026-08-29T14:34:00Z'),
  priorDistribution: { groceries: 60 },
};

function mockFetch(body: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status, json: async () => body })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Ollama classifier', () => {
  it('defaults to localhost', () => {
    expect(DEFAULT_OLLAMA_URL).toBe('http://localhost:11434');
  });

  it('parses a well-formed structured response', async () => {
    mockFetch({
      message: { content: '{"categoryId":"groceries","confidence":0.82,"reasoning":"amount fits"}' },
    });
    const r = await new OllamaClassifier({ model: 'llama3', taxonomy: 't' }).classify(input);
    expect(r.categoryId).toBe('groceries');
    expect(r.confidence).toBe(0.82);
  });

  it('sends the same payload as the hosted path, and a JSON schema', async () => {
    mockFetch({ message: { content: '{"categoryId":"x","confidence":0.5}' } });
    await new OllamaClassifier({ model: 'llama3', taxonomy: 'dining: Dining' }).classify(input);
    const call = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const body = JSON.parse((call?.[1] as { body: string }).body) as {
      format: unknown;
      stream: boolean;
      messages: Array<{ content: string }>;
    };
    expect(body.stream).toBe(false);
    expect(body.format).toMatchObject({ type: 'object' });
    expect(body.messages[1]?.content).toContain('TARGET 00023415');
    expect(body.messages[1]?.content).toContain('groceries: 100%');
  });

  it('clamps a confidence the local model returns out of range', async () => {
    mockFetch({ message: { content: '{"categoryId":"x","confidence":9}' } });
    const r = await new OllamaClassifier({ model: 'llama3', taxonomy: 't' }).classify(input);
    expect(r.confidence).toBe(1);
  });

  it('turns thinking off and bounds the context window', async () => {
    mockFetch({ message: { content: '{"categoryId":"x","confidence":0.5}' } });
    await new OllamaClassifier({ model: 'qwen3:4b', taxonomy: 't' }).classify(input);
    const call = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const body = JSON.parse((call?.[1] as { body: string }).body) as {
      think: boolean;
      options: { num_ctx: number };
    };
    expect(body.think).toBe(false);
    expect(body.options.num_ctx).toBe(4096);
  });

  it("puts Ollama's own error text in the message", async () => {
    mockFetch({ error: '"nomic-embed-text:latest" does not support chat' }, false, 400);
    await expect(
      new OllamaClassifier({ model: 'nomic-embed-text', taxonomy: 't' }).classify(input),
    ).rejects.toThrow(/nomic-embed-text:latest" does not support chat/);
  });

  it('keeps the status when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 502, json: async () => Promise.reject(new Error('x')) })),
    );
    await expect(
      new OllamaClassifier({ model: 'llama3', taxonomy: 't' }).classify(input),
    ).rejects.toThrow(/502/);
  });

  it('says Ollama is not running when the connection fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(
      new OllamaClassifier({ model: 'llama3', taxonomy: 't' }).classify(input),
    ).rejects.toThrow('Ollama is not running at http://localhost:11434. Start Ollama and try again.');
  });

  it('rejects an empty message rather than inventing a category', async () => {
    mockFetch({ message: {} });
    await expect(
      new OllamaClassifier({ model: 'llama3', taxonomy: 't' }).classify(input),
    ).rejects.toThrow(/no message content/i);
  });

  it('rejects malformed JSON from a local model', async () => {
    mockFetch({ message: { content: 'I think this is groceries!' } });
    await expect(
      new OllamaClassifier({ model: 'llama3', taxonomy: 't' }).classify(input),
    ).rejects.toThrow(/not valid JSON/i);
  });

  it('honours a custom base URL and strips a trailing slash', async () => {
    mockFetch({ message: { content: '{"categoryId":"x","confidence":0.5}' } });
    await new OllamaClassifier({
      model: 'llama3',
      taxonomy: 't',
      baseUrl: 'http://localhost:9999/',
    }).classify(input);
    const call = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(call?.[0]).toBe('http://localhost:9999/api/chat');
  });
});

describe('listing installed models', () => {
  it('maps the tags response', async () => {
    mockFetch({ models: [{ name: 'llama3:8b', size: 4_700_000_000 }] });
    const models = await listOllamaModels();
    expect(models).toEqual([{ name: 'llama3:8b', sizeBytes: 4_700_000_000 }]);
  });

  it('returns an empty list when Ollama reports no models', async () => {
    mockFetch({});
    expect(await listOllamaModels()).toEqual([]);
  });

  it('throws when Ollama answers with an error', async () => {
    mockFetch({}, false, 503);
    await expect(listOllamaModels()).rejects.toThrow(/503/);
  });

  it('says Ollama is not running when the connection fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(listOllamaModels('http://localhost:9999/')).rejects.toThrow(
      'Ollama is not running at http://localhost:9999. Start Ollama and try again.',
    );
  });

  it('drops embedding-only models but keeps models that report no capabilities', async () => {
    mockFetch({
      models: [
        { name: 'llama3.1:8b', size: 1, capabilities: ['completion', 'tools'] },
        { name: 'nomic-embed-text:latest', size: 2, capabilities: ['embedding'] },
        { name: 'old-model:latest', size: 3 },
      ],
    });
    const names = (await listOllamaModels()).map((m) => m.name);
    expect(names).toEqual(['llama3.1:8b', 'old-model:latest']);
  });
});
