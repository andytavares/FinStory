# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: review.spec.ts >> review queue >> opens the review queue
- Location: tests/e2e/review.spec.ts:17:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Review' })
    - locator resolved to <button type="button" class="icon flex items-center gap-3 px-5 py-2 text-left text-[13px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]">…</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
  - element was detached from the DOM, retrying

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - paragraph [ref=e4]: Set up once
  - heading "Connect your accounts" [level=1] [ref=e5]
  - paragraph [ref=e6]: Money reads your transactions and categorizes them for you. After this screen you will not be asked to enter anything again — no logging, no reconciling, no budgets to allocate.
  - generic [ref=e7]:
    - paragraph [ref=e8]: Plaid
    - paragraph [ref=e9]: From dashboard.plaid.com. Stored encrypted on this machine and never sent anywhere else. Start with Sandbox — the 10-account production limit is a lifetime cap.
    - generic [ref=e10]:
      - text: Client ID
      - textbox "Client ID" [ref=e11]
    - generic [ref=e12]:
      - text: Secret
      - textbox "Secret" [ref=e13]
    - group "Environment" [ref=e14]:
      - generic [ref=e16]:
        - radio "Sandbox" [checked] [ref=e17]
        - text: Sandbox
      - generic [ref=e18]:
        - radio "Production" [ref=e19]
        - text: Production
  - generic [ref=e20]:
    - paragraph [ref=e21]: Categorization (optional)
    - paragraph [ref=e22]: An Anthropic API key lets Money categorize merchants your own history cannot resolve. It sends the merchant name, amount, date, and your category history for that one merchant — never account numbers, balances, credentials, or totals. Leave it blank to keep everything on this machine; more transactions will need your review.
    - textbox "sk-ant-..." [ref=e23]
  - button "Save and continue" [disabled] [ref=e24]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { launch, dismissSetup, type Harness } from './helpers';
  3  | 
  4  | /** US6: the review queue, bulk selection, and the retroactive prompt. */
  5  | test.describe('review queue', () => {
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
  17 |   test('opens the review queue', async () => {
  18 |     await expect(harness.page.locator('#root')).toBeVisible({ timeout: 15_000 });
> 19 |     await harness.page.getByRole('button', { name: 'Review' }).click();
     |                                                                ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  20 |     // With no data yet the empty state is correct and must be informative.
  21 |     await expect(
  22 |       harness.page.getByText(/Nothing needs your review|flagged/),
  23 |     ).toBeVisible();
  24 |   });
  25 | 
  26 |   test('offers no manual transaction entry anywhere (SC-021)', async () => {
  27 |     for (const label of ['Dashboard', 'Transactions', 'Review']) {
  28 |       await harness.page.getByRole('button', { name: label }).click();
  29 |       await expect(harness.page.getByRole('button', { name: /add transaction/i })).toHaveCount(0);
  30 |     }
  31 |   });
  32 | });
  33 | 
```