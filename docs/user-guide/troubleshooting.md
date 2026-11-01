# Troubleshooting

Start with [Health](health.md). It shows what is wrong.

## Sync problems

| You see | What to do |
|---|---|
| **Sync failing** chip on a bank | Click **Sync now** in [Accounts](accounts.md) and read the message. |
| **Action needed** chip, or "Needs sign-in" | Click **Sign in again** on the bank card. Some banks, such as American Express, ask for this often. |
| Plaid says the keys are invalid | Open **Settings › Credentials**. Check that **Plaid environment** matches your keys. Sandbox keys need **Sandbox**. Production keys need **Production**. |
| A yellow note says figures are lower bounds | An account did not sync. Sign in again, or wait for the next sync. |
| No transactions at all | Click **Sync now** in [Accounts](accounts.md). Money reports what Plaid said. |
| Spending totals read zero | The accounts are not marked day-to-day. Turn **Counts toward day-to-day spending** on in [Accounts](accounts.md). |

## Keychain prompts

macOS can ask whether Money may use a Keychain item.

- Click **Always Allow**. Money reads its own items under `com.atavares.money`.
- If you click **Deny**, Money cannot open its database key. Restart Money and click **Always Allow**.
- "Money cannot start" means Money has no Keychain access. Unlock your login Keychain in **Keychain Access**, then open Money again.
- "The database key is missing from the Keychain": the key item was deleted. Restore a [backup](settings.md).

## Sorting problems

- Review is full and each card says "uncategorizable": no model is set up. Open **Settings › Categorization**, choose a model, then click **Sort these with AI** in [Review](review.md).
- A bad API key looks like a good one. Click **Test the model** in **Settings**.
- Ollama problems: see [Ollama](ollama.md).

## Import problems

| You see | What to do |
|---|---|
| A `.QDF` file | Money cannot read it. Export a CSV from Quicken. See [Importing from Quicken](importing-from-quicken.md). |
| "Which column is which?" | Money did not recognize the header row. Choose the **Date**, **Payee** and **Amount** columns, then click **Read file**. |
| "0 new" | Money already has every transaction in the file. |
| The wrong account | Click **Back**. Choose the right account in **Match accounts**. |

## Money does not open

- Restart your Mac and open Money again.
- Check that you installed the Apple Silicon `.dmg`.
- Install the newest `.dmg` from [Releases](https://github.com/andytavares/FinStory/releases). Your data stays.

## Export diagnostics

1. Open **Health**.
2. Click **Export diagnostics**.
3. Save `money-diagnostics.json`.

The file has no merchant names, amounts, balances or credentials. Attach it to your bug report.
