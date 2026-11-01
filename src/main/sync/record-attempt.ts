import { DiagnosticEventType, Outcome, type DiagnosticLogger } from '@main/diagnostics/logger';

/** Runs a sync and records one `sync_attempt` event with its outcome and duration. */
export async function recordSyncAttempt<T extends { failures: readonly unknown[] }>(
  logger: DiagnosticLogger,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  const record = (outcome: Outcome): void =>
    logger.record({
      type: DiagnosticEventType.SyncAttempt,
      outcome,
      durationMs: Math.round(performance.now() - startedAt),
    });
  try {
    const result = await run();
    record(result.failures.length === 0 ? Outcome.Success : Outcome.Failure);
    return result;
  } catch (error) {
    record(Outcome.Failure);
    throw error;
  }
}
