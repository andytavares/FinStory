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

const release = readFileSync('.github/workflows/release.yml', 'utf8');
const buildStep = release.slice(release.indexOf('electron-builder --mac'));

describe('release workflow signing', () => {
  // electron-builder 26.15.3 unlocks its own keychain with the .p12 password, so it fails.
  it('keeps the certificate away from electron-builder, which finds it in a prepared keychain', () => {
    expect(release).not.toMatch(/^\s{4}env:\n(?:\s{6}.*\n)*?\s{6}CSC_LINK:/m);
    expect(buildStep).not.toMatch(/CSC_LINK|CSC_KEY_PASSWORD/);
  });

  it('unlocks the signing keychain with its own password, not the certificate password', () => {
    expect(release).toMatch(/security create-keychain -p "\$KEYCHAIN_PASSWORD"/);
    expect(release).toMatch(/security set-key-partition-list -S apple-tool:,apple: -s -k "\$KEYCHAIN_PASSWORD"/);
    expect(release).toMatch(/security import "\$P12" -P "\$CSC_KEY_PASSWORD"/);
  });

  it("adds Apple's Developer ID intermediate so the signature chains to a trusted root", () => {
    expect(release).toMatch(/DeveloperIDG2CA\.cer/);
  });

  it('ships a 1024px app icon where electron-builder looks for it', () => {
    expect(config).toMatch(/buildResources: resources/);
    const png = readFileSync('resources/icon.png');
    // PNG header: width and height are big-endian at bytes 16 and 20.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1024, 1024]);
  });
});
