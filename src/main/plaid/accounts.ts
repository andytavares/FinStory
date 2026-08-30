import { CountryCode, type PlaidApi } from 'plaid';

/** Account metadata fetched immediately after linking, so balances are usable. */
export interface FetchedAccount {
  readonly plaidAccountId: string;
  readonly name: string;
  readonly mask: string | null;
  readonly type: string;
  readonly subtype: string | null;
  readonly currentBalanceMinor: number | null;
}

export interface FetchedItem {
  readonly institutionName: string;
  readonly accounts: FetchedAccount[];
}

function toMinor(amount: number | null | undefined): number | null {
  return amount === null || amount === undefined ? null : Math.round(amount * 100);
}

/** Read the accounts and balances behind a freshly linked Item. */
export async function fetchItemAccounts(
  client: PlaidApi,
  accessToken: string,
): Promise<FetchedItem> {
  const response = await client.accountsBalanceGet({ access_token: accessToken });

  let institutionName = 'Connected bank';
  const institutionId = response.data.item.institution_id;
  if (institutionId) {
    try {
      const inst = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
      });
      institutionName = inst.data.institution.name;
    } catch {
      // A missing display name must not block the connection.
    }
  }

  return {
    institutionName,
    accounts: response.data.accounts.map((a) => ({
      plaidAccountId: a.account_id,
      name: a.name,
      mask: a.mask ?? null,
      type: String(a.type),
      subtype: a.subtype === null || a.subtype === undefined ? null : String(a.subtype),
      currentBalanceMinor: toMinor(a.balances.current),
    })),
  };
}
