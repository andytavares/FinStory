# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: editing.spec.ts >> user control over transactions, alerts, and reports >> alert rules are editable, not just on/off
- Location: tests/e2e/editing.spec.ts:17:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Alerts' })
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
  1   | import { test, expect } from '@playwright/test';
  2   | import { launch, dismissSetup, type Harness } from './helpers';
  3   | 
  4   | /** The controls the user said were missing. */
  5   | test.describe('user control over transactions, alerts, and reports', () => {
  6   |   let harness: Harness;
  7   | 
  8   |   test.beforeAll(async () => {
  9   |     harness = await launch();
  10  |     await harness.page.locator('#root').waitFor({ timeout: 20_000 });
  11  |     await dismissSetup(harness.page);
  12  |   });
  13  |   test.afterAll(async () => {
  14  |     await harness.close();
  15  |   });
  16  | 
  17  |   test('alert rules are editable, not just on/off', async () => {
> 18  |     await harness.page.getByRole('button', { name: 'Alerts' }).click();
      |                                                                ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  19  |     // Default rules seed on first read, each with an editable threshold.
  20  |     // Scope to the rule list: the same wording also appears in the add-rule
  21  |     // dropdown's options.
  22  |     const rules = harness.page.getByRole('list').first();
  23  |     await expect(rules.getByText(/A single purchase over an amount/)).toBeVisible({
  24  |       timeout: 10_000,
  25  |     });
  26  |     const threshold = harness.page.getByLabel(/^Threshold for/).first();
  27  |     await expect(threshold).toBeVisible();
  28  |     await expect(threshold).toHaveValue('200');
  29  |   });
  30  | 
  31  |   test('a new alert can be created, including a second of the same kind', async () => {
  32  |     await expect(harness.page.getByRole('button', { name: 'Add alert' })).toBeVisible();
  33  |     const before = await harness.page.getByLabel(/^Threshold for/).count();
  34  |     await harness.page.getByLabel('New alert value').fill('1000');
  35  |     await harness.page.getByRole('button', { name: 'Add alert' }).click();
  36  |     await expect
  37  |       .poll(async () => harness.page.getByLabel(/^Threshold for/).count(), { timeout: 10_000 })
  38  |       .toBeGreaterThan(before);
  39  |   });
  40  | 
  41  |   test('a report can be run on demand', async () => {
  42  |     await harness.page.getByRole('button', { name: 'Reports' }).click();
  43  |     await expect(harness.page.getByRole('button', { name: 'Run monthly report' })).toBeVisible();
  44  |     await harness.page.getByRole('button', { name: 'Run monthly report' }).click();
  45  |     await expect(harness.page.getByText(/Monthly report ready/)).toBeVisible({ timeout: 15_000 });
  46  |   });
  47  | 
  48  |   test('the generated report then appears in the list', async () => {
  49  |     await expect(harness.page.getByText(/Monthly report/).first()).toBeVisible({ timeout: 10_000 });
  50  |   });
  51  | });
  52  | 
  53  | test.describe('income visibility and report detail', () => {
  54  |   let h: Harness;
  55  | 
  56  |   test.beforeAll(async () => {
  57  |     h = await launch();
  58  |     await h.page.locator('#root').waitFor({ timeout: 20_000 });
  59  |     await dismissSetup(h.page);
  60  |   });
  61  |   test.afterAll(async () => {
  62  |     await h.close();
  63  |   });
  64  | 
  65  |   test('the transaction log can be filtered to money in or money out', async () => {
  66  |     await h.page.getByRole('button', { name: 'Transactions' }).click();
  67  |     await expect(h.page.getByRole('button', { name: 'Money in' })).toBeVisible();
  68  |     await expect(h.page.getByRole('button', { name: 'Money out' })).toBeVisible();
  69  |     await h.page.getByRole('button', { name: 'Money in' }).click();
  70  |     await expect(h.page.getByRole('button', { name: 'Money in' })).toBeVisible();
  71  |   });
  72  | 
  73  |   test('a custom report can be generated over a date range', async () => {
  74  |     await h.page.getByRole('button', { name: 'Reports' }).click();
  75  |     await h.page.getByRole('button', { name: 'Custom range…' }).click();
  76  |     await h.page.getByLabel('Report start date').fill('2026-08-01');
  77  |     await h.page.getByLabel('Report end date').fill('2026-08-31');
  78  |     await h.page.getByLabel('Report name').fill('August review');
  79  |     await h.page.getByRole('button', { name: 'Generate' }).click();
  80  |     await expect(h.page.getByText('Custom report ready.')).toBeVisible({ timeout: 15_000 });
  81  |     await expect(h.page.getByText('August review')).toBeVisible();
  82  |   });
  83  | 
  84  |   test('a report opens to a detailed view and can be closed', async () => {
  85  |     await h.page.getByText('August review').click();
  86  |     await expect(h.page.getByText('← All reports')).toBeVisible({ timeout: 10_000 });
  87  |     await h.page.getByText('← All reports').click();
  88  |     await expect(h.page.getByRole('button', { name: 'Custom range…' })).toBeVisible();
  89  |   });
  90  | 
  91  |   test('a report can be deleted', async () => {
  92  |     const before = await h.page.getByLabel(/^Delete report from/).count();
  93  |     await h.page.getByLabel(/^Delete report from/).first().click();
  94  |     await expect
  95  |       .poll(async () => h.page.getByLabel(/^Delete report from/).count(), { timeout: 10_000 })
  96  |       .toBeLessThan(before);
  97  |   });
  98  | });
  99  | 
  100 | test.describe('navigation history', () => {
  101 |   let n: Harness;
  102 | 
  103 |   test.beforeAll(async () => {
  104 |     n = await launch();
  105 |     await n.page.locator('#root').waitFor({ timeout: 20_000 });
  106 |     await dismissSetup(n.page);
  107 |   });
  108 |   test.afterAll(async () => {
  109 |     await n.close();
  110 |   });
  111 | 
  112 |   test('back and forward controls are present', async () => {
  113 |     await expect(n.page.getByLabel('Back')).toBeVisible();
  114 |     await expect(n.page.getByLabel('Forward')).toBeVisible();
  115 |     // Forward is empty until something is popped.
  116 |     await expect(n.page.getByLabel('Forward')).toBeDisabled();
  117 |   });
  118 | 
```