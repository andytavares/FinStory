import { describe, it, expect } from 'vitest';
import { buildClassifier, DEFAULT_ANTHROPIC_MODEL, ANTHROPIC_MODELS } from '@main/categorization/factory';

describe('classifier selection (FR-061)', () => {
  it('defaults to Haiku', () => {
    expect(DEFAULT_ANTHROPIC_MODEL).toBe('claude-haiku-4-5');
  });

  it('offers Haiku, Sonnet, and Opus', () => {
    expect(ANTHROPIC_MODELS.map((m) => m.id)).toEqual([
      'claude-haiku-4-5',
      'claude-sonnet-5',
      'claude-opus-5',
    ]);
  });

  it('builds a Claude classifier when a key is present', () => {
    const b = buildClassifier({ provider: 'anthropic', taxonomy: 't', anthropicApiKey: 'k' });
    expect(b.classifier).not.toBeNull();
    expect(b.localOnly).toBe(false);
    expect(b.reason).toContain('claude-haiku-4-5');
  });

  it('honours a model override', () => {
    const b = buildClassifier({
      provider: 'anthropic',
      taxonomy: 't',
      anthropicApiKey: 'k',
      anthropicModel: 'claude-opus-5',
    });
    expect(b.reason).toContain('claude-opus-5');
  });

  it('degrades to local-only when the key is missing, and says why', () => {
    const b = buildClassifier({ provider: 'anthropic', taxonomy: 't' });
    expect(b.classifier).toBeNull();
    expect(b.localOnly).toBe(true);
    expect(b.reason).toMatch(/no anthropic api key/i);
  });

  it('builds an Ollama classifier for a local model', () => {
    const b = buildClassifier({ provider: 'ollama', taxonomy: 't', ollamaModel: 'llama3' });
    expect(b.classifier).not.toBeNull();
    expect(b.reason).toContain('llama3');
  });

  it('degrades when Ollama is selected but no model is chosen', () => {
    const b = buildClassifier({ provider: 'ollama', taxonomy: 't' });
    expect(b.localOnly).toBe(true);
    expect(b.reason).toMatch(/no ollama model/i);
  });

  it('local_only never constructs a network classifier', () => {
    expect(buildClassifier({ provider: 'local_only', taxonomy: 't' }).classifier).toBeNull();
  });
});
