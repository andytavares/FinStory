import type { PlaidApi } from 'plaid';
import { CountryCode, Products } from 'plaid';

/**
 * Account connection via Hosted Link.
 *
 * A desktop app cannot receive Link's frontend callback and cannot register the
 * https redirect_uri that Production requires. Plaid's own docs point at
 * /link/token/get for "Link flows that do not provide a public token via
 * frontend callbacks, such as the Hosted Link flow" — which is exactly this
 * situation (research.md R1).
 *
 * No redirect_uri, no local HTTP listener, no public address.
 */

export interface HostedLinkSession {
  readonly linkToken: string;
  readonly hostedLinkUrl: string;
}

/** With `accessToken`, Link opens in update mode to repair that existing login. */
export async function startHostedLink(
  client: PlaidApi,
  clientUserId: string,
  accessToken?: string,
): Promise<HostedLinkSession> {
  const response = await client.linkTokenCreate({
    client_name: 'Money',
    // Transactions only. FR-049 forbids money movement, and the read-only test
    // asserts no other product appears here. Plaid requires no products in update mode.
    ...(accessToken ? { access_token: accessToken } : { products: [Products.Transactions] }),
    country_codes: [CountryCode.Us],
    language: 'en',
    user: { client_user_id: clientUserId },
    hosted_link: {},
  });

  const { link_token, hosted_link_url } = response.data as {
    link_token: string;
    hosted_link_url?: string;
  };
  if (!hosted_link_url) {
    throw new Error('Plaid did not return a hosted link URL');
  }
  return { linkToken: link_token, hostedLinkUrl: hosted_link_url };
}

/**
 * Poll /link/token/get for the completed session's public token.
 *
 * Returns null while the user is still in the flow; the caller decides how long
 * to keep waiting.
 */
export async function pollForPublicToken(
  client: PlaidApi,
  linkToken: string,
): Promise<string | null> {
  const response = await client.linkTokenGet({ link_token: linkToken });
  const results = response.data.link_sessions ?? [];
  for (const session of results) {
    // Update mode adds no item, so its token only appears in on_success.
    const publicToken =
      session.results?.item_add_results?.[0]?.public_token ?? session.on_success?.public_token;
    if (publicToken) return publicToken;
  }
  return null;
}

export async function exchangePublicToken(
  client: PlaidApi,
  publicToken: string,
): Promise<{ accessToken: string; itemId: string }> {
  const response = await client.itemPublicTokenExchange({ public_token: publicToken });
  return { accessToken: response.data.access_token, itemId: response.data.item_id };
}
