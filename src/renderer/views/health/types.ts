import type { HealthView } from '@shared/types';

export interface SyncAttempt {
  readonly at: string;
  readonly ok: boolean;
  readonly durationMs: number | null;
}

/** `health:get` as the main process sends it. */
export type HealthData = HealthView & {
  readonly categorization: {
    readonly provider: string;
    readonly model: string | null;
    readonly localOnly: boolean;
    readonly reason: string;
  };
  readonly encryption: { readonly databaseEncrypted: boolean; readonly keysInKeychain: boolean };
  readonly updates: { readonly version: string };
  /** Newest first, at most 14. */
  readonly syncHistory: readonly SyncAttempt[];
};
