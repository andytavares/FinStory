import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Constitution VIII (Zero-Input Doctrine), SC-021.
 *
 * The test that matters: if a proposed feature stops working correctly when the
 * user ignores it, the feature is wrong for this product. This sweep catches
 * the concrete forms that violation takes.
 */

const VIEWS = join(process.cwd(), 'src/renderer/views');

/**
 * Patterns target entry AFFORDANCES, not any mention of a word. "Check for new
 * transactions" is sync copy; "Add transaction" is a form. The distinction is
 * the whole point, so the patterns are anchored on imperative verbs and form
 * elements rather than nouns.
 */
const FORBIDDEN_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/>\s*(Add|New|Record|Log|Enter)\s+(a\s+)?(transaction|expense|purchase)/i, 'a manual entry control'],
  [/onSubmit|<form\b/i, 'a data-entry form'],
  [/>\s*Reconcile|reconciliation\s+(step|screen|flow)/i, 'a reconciliation step'],
  [/envelope\s+budget|assign\s+every\s+dollar|>\s*Allocate/i, 'budget allocation'],
];

describe('no data-entry workflow exists anywhere in the UI', () => {
  const files = readdirSync(VIEWS).filter((f) => f.endsWith('.tsx'));

  it('has views to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} requires no data entry`, () => {
      const content = readFileSync(join(VIEWS, file), 'utf8');
      const violations = FORBIDDEN_PATTERNS.filter(([pattern]) => pattern.test(content)).map(
        ([, label]) => label,
      );
      expect(violations, `${file} contains ${violations.join(', ')}`).toEqual([]);
    });
  }
});

describe('icons are lucide-react only (Constitution XIV)', () => {
  const renderer = join(process.cwd(), 'src/renderer');

  function tsxFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...tsxFiles(full));
      else if (entry.name.endsWith('.tsx')) out.push(full);
    }
    return out;
  }

  const files = tsxFiles(renderer);

  it('uses no emoji or pictographic characters as UI elements', () => {
    const offenders: string[] = [];
    // Emoji and pictographic ranges.
    const pictographic = /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|\u{FE0F}/u;
    for (const file of files) {
      if (pictographic.test(readFileSync(file, 'utf8'))) {
        offenders.push(file.replace(`${process.cwd()}/`, ''));
      }
    }
    expect(offenders, `emoji found in:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('imports icons only from lucide-react', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const iconImports = content.match(/from '([^']*icon[^']*)'/gi) ?? [];
      for (const imp of iconImports) {
        if (!imp.includes('lucide-react')) offenders.push(`${file}: ${imp}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
