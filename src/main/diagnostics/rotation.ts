import type { DiagnosticEvent } from './logger';

/**
 * Log rotation (FR-093).
 *
 * Bounded by both count and age. An unbounded log on a machine the user never
 * inspects is a slow disk leak.
 */

export const MAX_EVENTS = 20_000;
export const MAX_AGE_DAYS = 90;

export interface RotationResult {
  readonly retained: DiagnosticEvent[];
  readonly dropped: number;
}

export function rotate(events: readonly DiagnosticEvent[], now: Date): RotationResult {
  const cutoff = now.getTime() - MAX_AGE_DAYS * 86_400_000;
  const byAge = events.filter((e) => new Date(e.occurredAt).getTime() >= cutoff);
  // Newest first, then cap.
  const retained = byAge.slice(Math.max(0, byAge.length - MAX_EVENTS));
  return { retained, dropped: events.length - retained.length };
}
