import type { DiagnosticEvent } from './logger';
import { Outcome } from './logger';

/**
 * Diagnostic export and health summary.
 *
 * There is no redaction step here, deliberately: DiagnosticEvent cannot carry
 * financial data in the first place (logger.ts). Filtering at export would mean
 * the protected data had already been written to disk outside the encrypted
 * database, which is what Principle VII forbids.
 */

export interface DiagnosticExport {
  readonly generatedAt: string;
  readonly eventCount: number;
  readonly droppedEventCount: number;
  readonly events: DiagnosticEvent[];
}

export function buildExport(
  events: readonly DiagnosticEvent[],
  meta: { droppedEventCount: number },
): DiagnosticExport {
  const last = events.at(-1);
  return {
    // Derived from the data, not the wall clock, so the export is reproducible.
    generatedAt: last?.occurredAt ?? '',
    eventCount: events.length,
    droppedEventCount: meta.droppedEventCount,
    events: [...events],
  };
}

export interface HealthSummary {
  readonly failuresBySubject: Record<string, number>;
  readonly lastSuccessBySubject: Record<string, string>;
  readonly degradedSubjects: string[];
}

const DEFAULT_DEGRADED_AFTER = 3;

export function summarizeHealth(
  events: readonly DiagnosticEvent[],
  options: { degradedAfterFailures?: number } = {},
): HealthSummary {
  const threshold = options.degradedAfterFailures ?? DEFAULT_DEGRADED_AFTER;
  const failuresBySubject: Record<string, number> = {};
  const lastSuccessBySubject: Record<string, string> = {};

  for (const e of events) {
    if (!e.subjectId) continue;
    if (e.outcome === Outcome.Failure) {
      failuresBySubject[e.subjectId] = (failuresBySubject[e.subjectId] ?? 0) + 1;
    } else if (e.outcome === Outcome.Success) {
      lastSuccessBySubject[e.subjectId] = e.occurredAt;
    }
  }

  return {
    failuresBySubject,
    lastSuccessBySubject,
    // FR-092: persistent failure is pushed to the user rather than waiting for
    // them to open the health view.
    degradedSubjects: Object.entries(failuresBySubject)
      .filter(([, n]) => n >= threshold)
      .map(([subject]) => subject),
  };
}
