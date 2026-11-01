import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
// [text](target) and ![alt](target); the target ends at whitespace or ")".
const LINK = /!?\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;

function markdownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? markdownFiles(path) : path.endsWith('.md') ? [path] : [];
  });
}

/** Relative targets only: web links, mailto and in-page anchors are not files. */
function brokenLinks(file: string): string[] {
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  return [...text.matchAll(LINK)]
    .map((match) => match[1] as string)
    .filter((target) => !/^([a-z]+:|#)/i.test(target))
    .filter((target) => !existsSync(resolve(dirname(file), decodeURIComponent(target.split('#')[0] as string))));
}

describe('documentation links', () => {
  const files = [join(ROOT, 'README.md'), ...markdownFiles(join(ROOT, 'docs'))];

  it.each(files.map((file) => [file.slice(ROOT.length + 1), file] as const))(
    '%s has no broken relative link or image',
    (_name, file) => {
      expect(brokenLinks(file)).toEqual([]);
    },
  );
});
