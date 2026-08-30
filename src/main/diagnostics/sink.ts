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
