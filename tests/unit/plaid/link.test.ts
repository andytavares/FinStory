import { describe, it, expect } from 'vitest';
import { startHostedLink, pollForPublicToken, exchangePublicToken } from '@main/plaid/link';
import { createPlaidClient } from '@main/plaid/client';
import type { PlaidApi } from 'plaid';

function fakeClient(overrides: Record<string, unknown>): PlaidApi {
  return overrides as unknown as PlaidApi;
}

describe('Hosted Link (research.md R1)', () => {
  it('requests only the transactions product', async () => {
    let captured: { products?: string[]; redirect_uri?: string } = {};
    const client = fakeClient({
      linkTokenCreate: async (req: typeof captured) => {
        captured = req;
        return { data: { link_token: 'lt_1', hosted_link_url: 'https://link.plaid.com/x' } };
      },
    });
    await startHostedLink(client, 'user_1');
    expect(captured.products).toEqual(['transactions']);
  });

  it('sends no redirect_uri — a desktop app has no public address (FR-055)', async () => {
    let captured: Record<string, unknown> = {};
    const client = fakeClient({
      linkTokenCreate: async (req: Record<string, unknown>) => {
        captured = req;
        return { data: { link_token: 'lt_1', hosted_link_url: 'https://link.plaid.com/x' } };
      },
    });
    await startHostedLink(client, 'user_1');
    expect(captured['redirect_uri']).toBeUndefined();
  });

  it('fails loudly when Plaid returns no hosted URL', async () => {
    const client = fakeClient({
      linkTokenCreate: async () => ({ data: { link_token: 'lt_1' } }),
    });
    await expect(startHostedLink(client, 'user_1')).rejects.toThrow(/hosted link/i);
  });

  it('returns null while the user is still in the flow', async () => {
    const client = fakeClient({ linkTokenGet: async () => ({ data: { link_sessions: [] } }) });
    expect(await pollForPublicToken(client, 'lt_1')).toBeNull();
  });

  it('extracts the public token once the session completes', async () => {
    const client = fakeClient({
      linkTokenGet: async () => ({
        data: { link_sessions: [{ results: { item_add_results: [{ public_token: 'pt_1' }] } }] },
      }),
    });
    expect(await pollForPublicToken(client, 'lt_1')).toBe('pt_1');
  });

  it('exchanges the public token for a durable access token', async () => {
    const client = fakeClient({
      itemPublicTokenExchange: async () => ({
        data: { access_token: 'at_1', item_id: 'item_1' },
      }),
    });
    expect(await exchangePublicToken(client, 'pt_1')).toEqual({
      accessToken: 'at_1',
      itemId: 'item_1',
    });
  });
});

describe('Plaid client construction', () => {
  it('builds a sandbox client', () => {
    expect(
      createPlaidClient({ clientId: 'c', secret: 's', environment: 'sandbox' }),
    ).toBeDefined();
  });

  it('builds a production client', () => {
    expect(
      createPlaidClient({ clientId: 'c', secret: 's', environment: 'production' }),
    ).toBeDefined();
  });

  it('rejects an unknown environment rather than silently defaulting', () => {
    expect(() =>
      createPlaidClient({
        clientId: 'c',
        secret: 's',
        environment: 'staging' as 'sandbox',
      }),
    ).toThrow(/environment/i);
  });
});
