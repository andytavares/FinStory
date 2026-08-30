import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

export type PlaidEnvironment = 'sandbox' | 'production';

export interface PlaidCredentials {
  readonly clientId: string;
  readonly secret: string;
  readonly environment: PlaidEnvironment;
}

/**
 * Plaid client.
 *
 * The secret lives on the user's own machine — an accepted, recorded deviation
 * from Plaid's guidance (ADR 0002 / research.md R10). It is viable only because
 * there is exactly one user and they own the credential. It is entered by the
 * user, stored safeStorage-encrypted, never bundled, never logged, and never
 * sent to the renderer.
 */
export function createPlaidClient(credentials: PlaidCredentials): PlaidApi {
  const basePath = PlaidEnvironments[credentials.environment];
  if (!basePath) {
    throw new TypeError(`Unknown Plaid environment: ${credentials.environment}`);
  }
  return new PlaidApi(
    new Configuration({
      basePath,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': credentials.clientId,
          'PLAID-SECRET': credentials.secret,
        },
      },
    }),
  );
}
