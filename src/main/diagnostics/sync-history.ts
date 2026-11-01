export interface SyncHistoryEntry {
  readonly at: string;
  readonly ok: boolean;
  readonly durationMs: number | null;
}

const SYNC_EVENT_TYPES = new Set(['sync_attempt', 'sync_failure']);
const HISTORY_LENGTH = 14;

/** The latest sync attempts, newest first. `events` must already be newest first. */
export function syncHistory(
  events: ReadonlyArray<{ occurredAt: string; eventType: string; outcome: string; durationMs: number | null }>,
): SyncHistoryEntry[] {
  return events
    .filter((event) => SYNC_EVENT_TYPES.has(event.eventType))
    .slice(0, HISTORY_LENGTH)
    .map((event) => ({ at: event.occurredAt, ok: event.outcome === 'success', durationMs: event.durationMs }));
}
