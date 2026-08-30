/**
 * Categorization corrections.
 *
 * Corrections are an append-only chain: a new record supersedes the old rather
 * than overwriting it (data-model.md). History survives, and restatement
 * becomes a pure recomputation rather than a destructive migration.
 */

export interface CategorizationRecord {
  readonly id: string;
  readonly transactionId: string;
  readonly categoryId: string;
  readonly confidence: number;
  readonly source: 'local_history' | 'model' | 'user';
  readonly isConfirmed: boolean;
  readonly needsReview: boolean;
  readonly supersededBy: string | null;
  readonly createdAt: string;
}

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `cat_${sequence.toString(36)}_${Math.trunc(sequence * 2654435761) % 1_000_000}`;
}

/** The live categorization is the one with no successor. */
export function liveCategorization(
  records: readonly CategorizationRecord[],
  transactionId: string,
): CategorizationRecord | undefined {
  return records.find((r) => r.transactionId === transactionId && r.supersededBy === null);
}

export function applyCorrection(
  records: readonly CategorizationRecord[],
  transactionId: string,
  categoryId: string,
  at: string,
): CategorizationRecord[] {
  const current = liveCategorization(records, transactionId);
  const replacement: CategorizationRecord = {
    id: nextId(),
    transactionId,
    categoryId,
    confidence: 1,
    source: 'user',
    isConfirmed: true,
    needsReview: false,
    supersededBy: null,
    createdAt: at,
  };
  return [
    ...records.map((r) => (r.id === current?.id ? { ...r, supersededBy: replacement.id } : r)),
    replacement,
  ];
}

export interface RetroactivePlan {
  readonly affectedCount: number;
  readonly affectedTransactionIds: string[];
  readonly protectedCount: number;
  readonly protectedTransactionIds: string[];
}

/**
 * Compute what a retroactive correction WOULD change, without changing it.
 *
 * FR-074: the user must be told how many transactions are affected before
 * deciding. A retroactive pass can silently rewrite a year of reports, so its
 * blast radius is stated first.
 */
export function planRetroactive(
  records: readonly CategorizationRecord[],
  merchantTransactionIds: readonly string[],
  categoryId: string,
): RetroactivePlan {
  const affected: string[] = [];
  const protectedIds: string[] = [];

  for (const transactionId of merchantTransactionIds) {
    const live = liveCategorization(records, transactionId);
    if (!live) continue;
    // A deliberate past correction always outranks a rule inferred later (FR-076).
    if (live.isConfirmed) {
      protectedIds.push(transactionId);
      continue;
    }
    if (live.categoryId === categoryId) continue;
    affected.push(transactionId);
  }

  return {
    affectedCount: affected.length,
    affectedTransactionIds: affected,
    protectedCount: protectedIds.length,
    protectedTransactionIds: protectedIds,
  };
}

/** Apply a retroactive correction. Requires explicit confirmation upstream (FR-075). */
export function applyRetroactive(
  records: readonly CategorizationRecord[],
  merchantTransactionIds: readonly string[],
  categoryId: string,
  at: string,
): CategorizationRecord[] {
  const plan = planRetroactive(records, merchantTransactionIds, categoryId);
  let next = [...records];
  for (const transactionId of plan.affectedTransactionIds) {
    next = applyCorrection(next, transactionId, categoryId, at);
  }
  return next;
}
