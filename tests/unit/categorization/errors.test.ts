import { describe, it, expect } from 'vitest';
import { explainModelError } from '@main/categorization/errors';

const WORKSPACE_400 =
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"anthropic-workspace-id is required when authenticating with an identity-linked API key; send the id of the workspace this request acts in."}}';

describe('explainModelError points at the fix without hiding the error', () => {
  it('names the Workspace ID setting for an identity-linked key', () => {
    const out = explainModelError(WORKSPACE_400);
    expect(out).toContain('Workspace ID in Settings');
    // The original must survive: a wrong guess plus a hidden cause is worse
    // than no guess at all.
    expect(out).toContain('anthropic-workspace-id is required');
  });

  it('points at the API key for an auth failure', () => {
    expect(explainModelError('401 invalid x-api-key')).toContain('check the API key');
  });

  it('names billing for an exhausted balance', () => {
    expect(explainModelError('Your credit balance is too low')).toContain('needs credit');
  });

  it('says to retry on a rate limit', () => {
    expect(explainModelError('429 rate_limit_error')).toContain('run it again');
  });

  it('tells the user to start Ollama when it is not running', () => {
    const out = explainModelError('Ollama is not running at http://localhost:11434. Start Ollama and try again.');
    expect(out).toBe('Ollama is not running at http://localhost:11434. Start Ollama and try again.');
  });

  it('tells the user to pick a chat model when the model cannot chat', () => {
    const out = explainModelError('Ollama: "nomic-embed-text:latest" does not support chat');
    expect(out).toContain('does not support chat');
    expect(out).toContain('choose a different model in Settings');
  });

  it('tells the user to pull a model that is not installed', () => {
    const out = explainModelError("Ollama: model 'x' not found");
    expect(out).toContain("model 'x' not found");
    expect(out).toContain('ollama pull');
  });

  it('says to retry when the API is overloaded', () => {
    expect(explainModelError('overloaded_error')).toContain('usually works');
  });

  it('passes an unrecognized error through untouched', () => {
    expect(explainModelError('something else entirely')).toBe('something else entirely');
  });

  it('handles no error at all', () => {
    expect(explainModelError(null)).toContain('unknown reason');
  });
});
