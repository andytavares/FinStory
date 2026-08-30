import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderOutboundPayload } from '@main/categorization/model';

/**
 * SC-016 / Constitution VII: no user financial data reaches any third-party
 * server beyond the FR-061 disclosure.
 *
 * Two checks: what the categorizer actually sends, and whether any other module
 * opens an outbound connection at all.
 */

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('outbound payload is limited to the FR-061 disclosure', () => {
  // Asserts against the REAL renderer, which is the single source of the
  // outbound payload. A copy of the string here would test nothing.
  const payload = renderOutboundPayload({
    merchantKey: 'target',
    descriptor: 'TARGET 00023415',
    amountMinor: -4312,
    occurredAt: new Date('2026-08-29T14:34:00Z'),
    priorDistribution: { groceries: 60, home: 40 },
  });

  it('sends merchant, amount, timestamp, and this merchant history', () => {
    expect(payload).toContain('TARGET 00023415');
    expect(payload).toContain('43.12');
    expect(payload).toContain('2026');
    expect(payload).toContain('groceries: 60%');
  });

  it('sends NOTHING beyond that disclosure', () => {
    const lines = payload.split('\n');
    expect(lines).toHaveLength(4);
    expect(payload).not.toMatch(/balance/i);
    expect(payload).not.toMatch(/account|routing/i);
    expect(payload).not.toMatch(/access[_-]?token|api[_-]?key|secret/i);
    expect(payload).not.toMatch(/total (spending|income)/i);
  });

  it('does not leak other merchants history', () => {
    const p = renderOutboundPayload({
      merchantKey: 'target',
      descriptor: 'TARGET',
      amountMinor: -4312,
      occurredAt: new Date('2026-08-29T14:34:00Z'),
      priorDistribution: { groceries: 60 },
    });
    expect(p).not.toContain('Uber');
    expect(p).not.toContain('Netflix');
  });

  it('handles an unseen merchant without inventing history', () => {
    const p = renderOutboundPayload({
      merchantKey: 'new',
      descriptor: 'NEW MERCHANT',
      amountMinor: -1000,
      occurredAt: new Date('2026-08-29T14:34:00Z'),
      priorDistribution: {},
    });
    expect(p).toContain('No prior purchases');
  });
});

describe('no unexpected outbound network surface', () => {
  const files = sourceFiles(join(process.cwd(), 'src'));

  const ALLOWED_NETWORK_MODULES = ['plaid', 'categorization/model'];

  it('only Plaid and the categorizer perform network I/O', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.replace(`${process.cwd()}/`, '');
      if (ALLOWED_NETWORK_MODULES.some((m) => rel.includes(m))) continue;
      const content = readFileSync(file, 'utf8');
      // Detect real network I/O: a global fetch call, an HTTP client import, or
      // a socket. A method *named* fetch on an injected interface is not network
      // I/O — src/main/sync/engine.ts has one and performs none.
      const networkPatterns = [
        /(?:^|[^.\w])fetch\s*\(\s*['"`]/, // fetch('http...')
        /globalThis\.fetch|window\.fetch/,
        /from\s+['"](?:axios|node-fetch|got|undici|node:https?|https?)['"]/,
        /require\(['"](?:axios|node-fetch|got|undici|node:https?|https?)['"]\)/,
        /new WebSocket|XMLHttpRequest/,
      ];
      if (networkPatterns.some((p) => p.test(content))) {
        offenders.push(rel);
      }
    }
    expect(offenders, `unexpected network I/O in:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no module writes user data to a remote destination', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      if (/telemetry|analytics|sentry|datadog|posthog|mixpanel/i.test(content)) {
        offenders.push(file.replace(`${process.cwd()}/`, ''));
      }
    }
    expect(offenders, `telemetry found in:\n${offenders.join('\n')}`).toEqual([]);
  });
});
