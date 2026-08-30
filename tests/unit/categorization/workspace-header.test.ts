import { describe, it, expect, vi } from 'vitest';

const constructed: Array<Record<string, unknown>> = [];
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: () => Promise.resolve({ content: [] }) };
    constructor(options: Record<string, unknown>) {
      constructed.push(options);
    }
  },
}));

const { ClaudeClassifier } = await import('@main/categorization/model');

/**
 * An identity-linked API key rejects every request without this header, so the
 * key alone is not enough to configure Claude.
 */
describe('the Anthropic client sends the workspace id when there is one', () => {
  it('sets the header when a workspace id is configured', () => {
    constructed.length = 0;
    new ClaudeClassifier({ apiKey: 'k', taxonomy: '', workspaceId: 'wrkspc_123' });
    expect(constructed[0]?.['defaultHeaders']).toEqual({
      'anthropic-workspace-id': 'wrkspc_123',
    });
  });

  it('sends no header when none is configured', () => {
    constructed.length = 0;
    new ClaudeClassifier({ apiKey: 'k', taxonomy: '' });
    expect(constructed[0]?.['defaultHeaders']).toBeUndefined();
  });

  it('treats whitespace as absent rather than sending a blank header', () => {
    constructed.length = 0;
    new ClaudeClassifier({ apiKey: 'k', taxonomy: '', workspaceId: '   ' });
    expect(constructed[0]?.['defaultHeaders']).toBeUndefined();
  });

  it('trims a pasted workspace id', () => {
    constructed.length = 0;
    new ClaudeClassifier({ apiKey: 'k', taxonomy: '', workspaceId: '  wrkspc_9  ' });
    expect(constructed[0]?.['defaultHeaders']).toEqual({ 'anthropic-workspace-id': 'wrkspc_9' });
  });
});
