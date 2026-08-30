import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, redactForRenderer, isSecretKey } from '@main/settings/index';

describe('settings', () => {
  it('has a usable default configuration requiring no setup', () => {
    expect(DEFAULT_SETTINGS.confidenceThreshold).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.categorizationMode).toBe('hybrid');
  });

  it('clamps the confidence threshold into range', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { confidenceThreshold: 5 }).confidenceThreshold).toBe(1);
    expect(mergeSettings(DEFAULT_SETTINGS, { confidenceThreshold: -1 }).confidenceThreshold).toBe(0);
  });

  it('clamps the poll interval to a sane range', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { pollIntervalMinutes: 1 }).pollIntervalMinutes).toBe(15);
    expect(mergeSettings(DEFAULT_SETTINGS, { pollIntervalMinutes: 99999 }).pollIntervalMinutes).toBe(1440);
  });

  it('supports switching to local-only categorization (FR-061)', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { categorizationMode: 'local_only' }).categorizationMode).toBe(
      'local_only',
    );
  });

  it('NEVER returns secret values to the renderer (FR-047)', () => {
    const redacted = redactForRenderer({
      plaidSecret: 'super-secret-value',
      anthropicApiKey: 'sk-ant-secret',
      plaidClientId: 'client-123',
    });
    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain('super-secret-value');
    expect(serialized).not.toContain('sk-ant-secret');
    expect(serialized).not.toContain('client-123');
    expect(redacted['plaidSecretConfigured']).toBe(true);
  });

  it('reports absent secrets as unconfigured', () => {
    expect(redactForRenderer({})['plaidSecretConfigured']).toBe(false);
  });

  it('identifies which keys are secret', () => {
    expect(isSecretKey('plaidSecret')).toBe(true);
    expect(isSecretKey('pollIntervalMinutes')).toBe(false);
  });
});

describe('the Anthropic workspace id', () => {
  it('defaults to empty, since most keys do not need one', () => {
    expect(DEFAULT_SETTINGS.anthropicWorkspaceId).toBe('');
  });

  it('is carried through an update', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { anthropicWorkspaceId: 'wrkspc_1' });
    expect(merged.anthropicWorkspaceId).toBe('wrkspc_1');
  });

  it('survives an unrelated update', () => {
    const withId = mergeSettings(DEFAULT_SETTINGS, { anthropicWorkspaceId: 'wrkspc_1' });
    expect(mergeSettings(withId, { anthropicModel: 'claude-opus-5' }).anthropicWorkspaceId).toBe(
      'wrkspc_1',
    );
  });

  it('is not a secret: it identifies a workspace, it does not authorize one', () => {
    expect(isSecretKey('anthropicWorkspaceId')).toBe(false);
    expect(isSecretKey('anthropicApiKey')).toBe(true);
  });
})
