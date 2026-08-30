# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: connect-and-models.spec.ts >> connect and model selection >> explains what happens before any account is connected
- Location: tests/e2e/connect-and-models.spec.ts:21:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/No accounts connected yet/)
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText(/No accounts connected yet/)

```

```yaml
- paragraph: Set up once
- heading "Connect your accounts" [level=1]
- paragraph: Money reads your transactions and categorizes them for you. After this screen you will not be asked to enter anything again — no logging, no reconciling, no budgets to allocate.
- paragraph: Plaid
- paragraph: From dashboard.plaid.com. Stored encrypted on this machine and never sent anywhere else. Start with Sandbox — the 10-account production limit is a lifetime cap.
- text: Client ID
- textbox "Client ID"
- text: Secret
- textbox "Secret"
- group "Environment":
  - text: Environment
  - radio "Sandbox" [checked]
  - text: Sandbox
  - radio "Production"
  - text: Production
- paragraph: Categorization (optional)
- paragraph: An Anthropic API key lets Money categorize merchants your own history cannot resolve. It sends the merchant name, amount, date, and your category history for that one merchant — never account numbers, balances, credentials, or totals. Leave it blank to keep everything on this machine; more transactions will need your review.
- textbox "sk-ant-..."
- button "Save and continue" [disabled]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { launch, dismissSetup, type Harness } from './helpers';
  3  | 
  4  | /** The two things the user could not do: connect an account, and choose a model. */
  5  | test.describe('connect and model selection', () => {
  6  |   let harness: Harness;
  7  | 
  8  |   test.beforeAll(async () => {
  9  |     harness = await launch();
  10 |     await harness.page.locator('#root').waitFor({ timeout: 20_000 });
  11 |     await dismissSetup(harness.page);
  12 |   });
  13 |   test.afterAll(async () => {
  14 |     await harness.close();
  15 |   });
  16 | 
  17 |   test('setup leads straight to Accounts, where connecting is the obvious action', async () => {
  18 |     await expect(harness.page.getByRole('button', { name: 'Connect an account' })).toBeVisible();
  19 |   });
  20 | 
  21 |   test('explains what happens before any account is connected', async () => {
> 22 |     await expect(harness.page.getByText(/No accounts connected yet/)).toBeVisible();
     |                                                                       ^ Error: expect(locator).toBeVisible() failed
  23 |     await expect(harness.page.getByText(/never enter a transaction by hand/)).toBeVisible();
  24 |   });
  25 | 
  26 |   test('offers all three categorization providers with their privacy stated', async () => {
  27 |     await harness.page.getByRole('button', { name: 'Settings' }).click();
  28 |     // Each option's label wraps a nested detail span, so match on the radio
  29 |     // group and the distinguishing copy rather than an exact text node.
  30 |     await expect(harness.page.locator('input[name="modelProvider"]')).toHaveCount(3);
  31 |     await expect(harness.page.getByText(/Local model via Ollama/)).toBeVisible();
  32 |     await expect(harness.page.getByText(/Nothing leaves this machine at all/)).toBeVisible();
  33 |     await expect(harness.page.getByText(/Never account numbers, balances/)).toBeVisible();
  34 |   });
  35 | 
  36 |   test('defaults to Haiku and offers the other Claude models', async () => {
  37 |     await harness.page.getByRole('button', { name: 'Settings' }).click();
  38 |     const select = harness.page.locator('select').first();
  39 |     await expect(select).toHaveValue('claude-haiku-4-5');
  40 |     await expect(select.locator('option')).toHaveCount(3);
  41 |   });
  42 | 
  43 |   test('switching to Ollama lists models installed on this machine', async () => {
  44 |     await harness.page.getByRole('button', { name: 'Settings' }).click();
  45 |     await harness.page.locator('input[name="modelProvider"]').nth(1).check();
  46 |     // Either a picker (Ollama running) or a clear explanation (not running).
  47 |     await expect(
  48 |       harness.page.getByText(/Installed model|No local models found/),
  49 |     ).toBeVisible({ timeout: 10_000 });
  50 |   });
  51 | });
  52 | 
```