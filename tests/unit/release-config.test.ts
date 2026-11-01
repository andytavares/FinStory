import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const config = readFileSync('electron-builder.yml', 'utf8');

describe('electron-builder.yml', () => {
  it('builds dmg and zip for Apple Silicon only (zip is required for auto-update)', () => {
    expect(config).toMatch(/- target: dmg\n\s+arch: \[arm64\]/);
    expect(config).toMatch(/- target: zip\n\s+arch: \[arm64\]/);
    expect(config).toMatch(/hardenedRuntime: true/);
    expect(config).not.toMatch(/^win:/m);
  });

  it('publishes drafts to the GitHub repository', () => {
    expect(config).toMatch(
      /publish:\n\s+provider: github\n\s+owner: andytavares\n\s+repo: FinStory\n\s+releaseType: draft/,
    );
  });
});
