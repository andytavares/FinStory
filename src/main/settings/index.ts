import type { AppSettings } from '@shared/types';

/**
 * Settings.
 *
 * Secret values (Plaid credentials, API key) live in the same store but are
 * flagged and sealed; they are never returned across IPC — reads expose
 * presence only (FR-047).
 */

export const DEFAULT_SETTINGS: AppSettings = {
  // The threshold from the source system's observed behaviour; tunable.
  confidenceThreshold: 0.8,
  // Alert latency is bounded by this. Polling faster than the institution
  // refreshes upstream gains nothing (research.md R2).
  pollIntervalMinutes: 60,
  categorizationMode: 'hybrid',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

const SECRET_KEYS = new Set(['plaidClientId', 'plaidSecret', 'anthropicApiKey']);

export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key);
}

export function mergeSettings(
  current: AppSettings,
  update: Partial<AppSettings>,
): AppSettings {
  return {
    confidenceThreshold: clamp(update.confidenceThreshold ?? current.confidenceThreshold, 0, 1),
    pollIntervalMinutes: clamp(update.pollIntervalMinutes ?? current.pollIntervalMinutes, 15, 1440),
    categorizationMode: update.categorizationMode ?? current.categorizationMode,
    timeZone: update.timeZone ?? current.timeZone,
  };
}

/** Presence only — never the values (FR-047). */
export function redactForRenderer(raw: Record<string, string>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of SECRET_KEYS) {
    out[`${key}Configured`] = Boolean(raw[key]);
  }
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
