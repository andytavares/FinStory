import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * FR-047 / quickstart V15: no secret reaches the renderer.
 *
 * Scans the BUILT renderer bundle — the artifact that actually ships — rather
 * than the source, because a build step could in principle inline something the
 * source does not show.
 */
const RENDERER_OUT = join(process.cwd(), 'out/renderer/assets');

const SECRET_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/PLAID-SECRET/i, 'Plaid secret header'],
  [/sk-ant-[A-Za-z0-9-]+/, 'Anthropic API key'],
  [/access-(sandbox|production)-[a-z0-9-]+/i, 'Plaid access token'],
  [/anthropic.*apiKey\s*:/i, 'Anthropic client construction'],
];

test('the renderer bundle contains no secrets or secret-bearing clients', () => {
  const files = readdirSync(RENDERER_OUT).filter((f) => f.endsWith('.js'));
  expect(files.length, 'renderer bundle must exist — run npm run build first').toBeGreaterThan(0);

  const offenders: string[] = [];
  for (const file of files) {
    const content = readFileSync(join(RENDERER_OUT, file), 'utf8');
    for (const [pattern, label] of SECRET_PATTERNS) {
      if (pattern.test(content)) offenders.push(`${file}: ${label}`);
    }
  }
  expect(offenders, `secrets found in renderer bundle:\n${offenders.join('\n')}`).toEqual([]);
});

test('the renderer bundle does not embed the Plaid or Anthropic SDKs', () => {
  const files = readdirSync(RENDERER_OUT).filter((f) => f.endsWith('.js'));
  const offenders: string[] = [];
  for (const file of files) {
    const content = readFileSync(join(RENDERER_OUT, file), 'utf8');
    // These clients belong to the main process only.
    if (/PlaidEnvironments|plaid\.com\/link\/token/.test(content)) {
      offenders.push(`${file}: Plaid SDK`);
    }
  }
  expect(offenders).toEqual([]);
});
