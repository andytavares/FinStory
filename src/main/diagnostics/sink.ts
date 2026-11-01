import type { DatabaseHandle } from '@main/db/client';
import { diagnosticEvents } from '@main/db/schema';
import type { DiagnosticEvent } from './logger';

/** Destination for diagnostic events. Implementations must not throw to callers. */
export interface DiagnosticSink {
  write(event: DiagnosticEvent): void;
}

/** In-memory sink, used by tests and by the health view's recent-failure window. */
export class MemorySink implements DiagnosticSink {
  readonly events: DiagnosticEvent[] = [];

  write(event: DiagnosticEvent): void {
    this.events.push(event);
  }
}

/** Persists events to `diagnostic_events`. The logger already validated every field, so no free text arrives. */
export class DatabaseSink implements DiagnosticSink {
  constructor(private readonly db: DatabaseHandle['db']) {}

  write(event: DiagnosticEvent): void {
    this.db
      .insert(diagnosticEvents)
      .values({
        occurredAt: event.occurredAt,
        eventType: event.type,
        outcome: event.outcome,
        subjectId: event.subjectId ?? null,
        durationMs: event.durationMs ?? null,
        errorCode: event.errorCode ?? null,
      })
      .run();
  }
}
