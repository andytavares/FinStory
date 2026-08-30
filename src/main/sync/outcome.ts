/**
 * What a sync run actually did.
 *
 * Sync used to return nothing and swallow every per-institution failure, so a
 * run that fetched zero transactions because the credentials were wrong looked
 * exactly like a run with nothing new. Constitution IX: the app reports what
 * happened, including when what happened was nothing.
 */
export interface SyncOutcome {
  readonly added: number;
  readonly updated: number;
  readonly removed: number;
  readonly skipped: number;
  readonly institutionCount: number;
  readonly failures: readonly string[];
  /** Transactions the model stage could not classify because it errored. */
  readonly modelFailures: number;
  readonly modelError: string | null;
  readonly blocked: 'no_institutions' | 'no_credentials' | null;
}

export const EMPTY_SYNC: SyncOutcome = {
  added: 0,
  updated: 0,
  removed: 0,
  skipped: 0,
  institutionCount: 0,
  failures: [],
  modelFailures: 0,
  modelError: null,
  blocked: null,
};

export interface SyncSummary {
  readonly ok: boolean;
  readonly message: string;
  /** Present when the run produced data but something still went wrong. */
  readonly warning: string | null;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Turn an outcome into the sentence the user reads. Pure, so the wording is
 * tested rather than eyeballed in a running app.
 */
export function summarizeSync(outcome: SyncOutcome): SyncSummary {
  if (outcome.blocked === 'no_institutions') {
    return { ok: false, message: 'No accounts connected yet — connect one first.', warning: null };
  }
  if (outcome.blocked === 'no_credentials') {
    return {
      ok: false,
      message: 'Plaid credentials are missing, so there was nothing to sync. Add them in Settings.',
      warning: null,
    };
  }

  const touched = outcome.added + outcome.updated + outcome.removed;
  if (outcome.failures.length > 0 && touched === 0) {
    return { ok: false, message: `Sync failed: ${outcome.failures[0]}`, warning: null };
  }

  const parts: string[] = [];
  if (outcome.added > 0) parts.push(`${plural(outcome.added, 'new transaction')}`);
  if (outcome.updated > 0) parts.push(`${outcome.updated} updated`);
  if (outcome.removed > 0) parts.push(`${outcome.removed} removed`);
  const message = parts.length > 0 ? `Synced: ${parts.join(', ')}.` : 'Synced. Nothing new.';

  const warnings: string[] = [];
  if (outcome.failures.length > 0) {
    warnings.push(
      `${plural(outcome.failures.length, 'account')} failed: ${outcome.failures.join('; ')}`,
    );
  }
  if (outcome.modelError) {
    warnings.push(
      `The categorization model failed on ${plural(outcome.modelFailures, 'transaction')}, so they fell back to your history: ${outcome.modelError}`,
    );
  }
  if (outcome.skipped > 0) {
    warnings.push(`${plural(outcome.skipped, 'transaction')} skipped: unknown account.`);
  }

  return { ok: true, message, warning: warnings.length > 0 ? warnings.join(' ') : null };
}
