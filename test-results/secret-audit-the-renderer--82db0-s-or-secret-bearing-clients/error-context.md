# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: secret-audit.spec.ts >> the renderer bundle contains no secrets or secret-bearing clients
- Location: tests/e2e/secret-audit.spec.ts:21:1

# Error details

```
Error: secrets found in renderer bundle:
index-DZAXkLWM.js: Anthropic client construction

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "index-DZAXkLWM.js: Anthropic client construction",
+ ]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { readFileSync, readdirSync } from 'node:fs';
  3  | import { join } from 'node:path';
  4  | 
  5  | /**
  6  |  * FR-047 / quickstart V15: no secret reaches the renderer.
  7  |  *
  8  |  * Scans the BUILT renderer bundle — the artifact that actually ships — rather
  9  |  * than the source, because a build step could in principle inline something the
  10 |  * source does not show.
  11 |  */
  12 | const RENDERER_OUT = join(process.cwd(), 'out/renderer/assets');
  13 | 
  14 | const SECRET_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  15 |   [/PLAID-SECRET/i, 'Plaid secret header'],
  16 |   [/sk-ant-[A-Za-z0-9-]+/, 'Anthropic API key'],
  17 |   [/access-(sandbox|production)-[a-z0-9-]+/i, 'Plaid access token'],
  18 |   [/anthropic.*apiKey\s*:/i, 'Anthropic client construction'],
  19 | ];
  20 | 
  21 | test('the renderer bundle contains no secrets or secret-bearing clients', () => {
  22 |   const files = readdirSync(RENDERER_OUT).filter((f) => f.endsWith('.js'));
  23 |   expect(files.length, 'renderer bundle must exist — run npm run build first').toBeGreaterThan(0);
  24 | 
  25 |   const offenders: string[] = [];
  26 |   for (const file of files) {
  27 |     const content = readFileSync(join(RENDERER_OUT, file), 'utf8');
  28 |     for (const [pattern, label] of SECRET_PATTERNS) {
  29 |       if (pattern.test(content)) offenders.push(`${file}: ${label}`);
  30 |     }
  31 |   }
> 32 |   expect(offenders, `secrets found in renderer bundle:\n${offenders.join('\n')}`).toEqual([]);
     |                                                                                   ^ Error: secrets found in renderer bundle:
  33 | });
  34 | 
  35 | test('the renderer bundle does not embed the Plaid or Anthropic SDKs', () => {
  36 |   const files = readdirSync(RENDERER_OUT).filter((f) => f.endsWith('.js'));
  37 |   const offenders: string[] = [];
  38 |   for (const file of files) {
  39 |     const content = readFileSync(join(RENDERER_OUT, file), 'utf8');
  40 |     // These clients belong to the main process only.
  41 |     if (/PlaidEnvironments|plaid\.com\/link\/token/.test(content)) {
  42 |       offenders.push(`${file}: Plaid SDK`);
  43 |     }
  44 |   }
  45 |   expect(offenders).toEqual([]);
  46 | });
  47 | 
```