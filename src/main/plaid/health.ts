/**
 * Institution feed health.
 *
 * Constitution IX and SC-014: an incomplete period is never presented as
 * complete. This is the function every total-bearing response calls to decide
 * whether it must carry a qualification.
 */

export const INSTITUTION_STALE_AFTER_HOURS = 36;

export interface InstitutionState {
  readonly id: string;
  readonly name: string;
  readonly status: 'healthy' | 'reauth_required' | 'error';
  readonly lastSyncedAt: Date | null;
}

export interface Completeness {
  readonly dataComplete: boolean;
  readonly staleInstitutions: string[];
}

export function assessCompleteness(
  institutions: readonly InstitutionState[],
  now: Date,
): Completeness {
  // No connected institutions is not "complete" — it is "nothing to be complete
  // about", and presenting a zero total as authoritative would be misleading.
  if (institutions.length === 0) {
    return { dataComplete: false, staleInstitutions: [] };
  }

  const staleCutoff = now.getTime() - INSTITUTION_STALE_AFTER_HOURS * 3_600_000;
  const stale = institutions.filter(
    (i) =>
      i.status !== 'healthy' ||
      i.lastSyncedAt === null ||
      i.lastSyncedAt.getTime() < staleCutoff,
  );

  return {
    dataComplete: stale.length === 0,
    staleInstitutions: stale.map((i) => i.name),
  };
}

/** Plaid error codes that mean the user must reconnect. */
const REAUTH_CODES = new Set(['ITEM_LOGIN_REQUIRED', 'ITEM_LOCKED', 'PENDING_EXPIRATION']);

export function statusFromPlaidError(errorCode: string | null): InstitutionState['status'] {
  if (errorCode === null) return 'healthy';
  return REAUTH_CODES.has(errorCode) ? 'reauth_required' : 'error';
}
