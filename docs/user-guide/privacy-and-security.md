# Privacy and security

Money keeps your data on your Mac. This page says what is stored where, and what can leave.

## What is stored where

| Data | Where | How it is protected |
|---|---|---|
| Transactions, accounts, rules, reports, settings | A database file in Money's data folder on your Mac | Encrypted on disk with ChaCha20-Poly1305. Money uses `better-sqlite3-multiple-ciphers`. |
| The database key | macOS Keychain | One Keychain item. |
| Plaid Client ID and Secret | macOS Keychain | One Keychain item for each. |
| Anthropic API key | macOS Keychain | One Keychain item. |
| Plaid access token for each bank | macOS Keychain | One Keychain item for each bank. |
| Usage log | The same encrypted database | Never sent anywhere. |
| Diagnostic log | Money's data folder | Holds no merchant names, amounts, balances or credentials. |

Every secret is its own item in the Keychain, under the service name `com.atavares.money`. You can see them in **Keychain Access**. Money shows only whether a secret is set. It never shows the value.

Money will not start if macOS cannot give it Keychain access. It does not fall back to an unencrypted database.

## What each categorization option sends

| Option | Sent off your Mac |
|---|---|
| **Ollama (local)** | Nothing. The model runs on your Mac. |
| **History only** | Nothing. |
| **Claude** | For a merchant Money cannot resolve from your history: the merchant name, amount, date, and your category history for that one merchant. Never account numbers, balances, credentials or totals. |

A merchant you already confirmed is never sent. Your history and rules are checked first.

## Your bank

Money talks to your bank through Plaid. Your bank password goes to Plaid's sign-in window in your browser. Money never sees it. Money keeps the Plaid access token. Money only reads. It cannot move money.

## Usage data

Money records which features you use. It stores this on your Mac only. See [Usage](usage.md).

## Backups

A backup holds the encrypted database and its database key. The key is locked with your passphrase. The backup does not hold your Plaid keys or bank tokens. Without the passphrase, nobody can open it, including you. See [Settings](settings.md).

## Erase everything

**Settings › Data and privacy › Reset everything…** erases all data and keys on this Mac.
