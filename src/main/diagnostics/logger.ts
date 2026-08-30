import type { Clock } from '@shared/clock';
import type { DiagnosticSink } from './sink';

/**
 * Diagnostic logging with redaction enforced at the write boundary.
 *
 * Constitution Principle VII and FR-091: no merchant name, amount, balance,
 * account number, or credential may reach the log.
 *
 * This is deliberately built so leaking is *impossible* rather than *filtered*.
 * A redact-on-export design would still write protected data to disk, outside
 * the encrypted database, where it would sit until someone happened to export.
 * So the input type admits no free text at all: the event type and error code
 * are enumerations, and the only caller-supplied string is an opaque identifier
 * validated against a strict shape.
 */

export enum DiagnosticEventType {
  SyncAttempt = 'sync_attempt',
  SyncFailure = 'sync_failure',
  Categorization = 'categorization',
  JobRun = 'job_run',
  AlertEval = 'alert_eval',
  Export = 'export',
  ReauthRequired = 'reauth_required',
}

export enum Outcome {
  Success = 'success',
  Failure = 'failure',
  Skipped = 'skipped',
}

export enum ErrorCode {
  Network = 'network',
  RateLimited = 'rate_limited',
  ReauthRequired = 'reauth_required',
  Unconfigured = 'unconfigured',
  Timeout = 'timeout',
  Validation = 'validation',
  Internal = 'internal',
}

export interface DiagnosticEvent {
  readonly occurredAt: string;
  readonly type: DiagnosticEventType;
  readonly outcome: Outcome;
  readonly subjectId: string | undefined;
  readonly durationMs: number | undefined;
  readonly errorCode: ErrorCode | undefined;
}

export interface DiagnosticInput {
  readonly type: DiagnosticEventType;
  readonly outcome: Outcome;
  readonly subjectId?: string;
  readonly durationMs?: number;
  readonly errorCode?: ErrorCode;
}

/**
 * Opaque identifiers only: a short prefix, an underscore, then alphanumerics.
 * Deliberately narrow — it must reject a merchant name ("Uber Eats") and a card
 * number ("4111111111111111") alike.
 */
const OPAQUE_ID = /^[a-z]{3,6}_[A-Za-z0-9]{1,32}$/;

const VALID_ERROR_CODES = new Set<string>(Object.values(ErrorCode));
const VALID_EVENT_TYPES = new Set<string>(Object.values(DiagnosticEventType));
const VALID_OUTCOMES = new Set<string>(Object.values(Outcome));

export class DiagnosticLogger {
  #dropped = 0;

  constructor(
    private readonly sink: DiagnosticSink,
    private readonly clock: Clock,
  ) {}

  /** Events discarded because the sink failed. Surfaced in the health view. */
  get droppedEventCount(): number {
    return this.#dropped;
  }

  record(input: DiagnosticInput): void {
    // Validation throws: a caller trying to log protected data is a defect that
    // must surface loudly in development, not be silently dropped.
    if (!VALID_EVENT_TYPES.has(input.type)) {
      throw new TypeError(`Unknown diagnostic event type: ${String(input.type)}`);
    }
    if (!VALID_OUTCOMES.has(input.outcome)) {
      throw new TypeError(`Unknown diagnostic outcome: ${String(input.outcome)}`);
    }
    if (input.subjectId !== undefined && !OPAQUE_ID.test(input.subjectId)) {
      throw new TypeError(
        'Diagnostic subjectId must be an opaque identifier (e.g. "txn_01H8XYZ"); ' +
          'free text may carry protected financial data',
      );
    }
    if (input.errorCode !== undefined && !VALID_ERROR_CODES.has(input.errorCode)) {
      throw new TypeError(`Diagnostic error code must be an enumerated ErrorCode`);
    }

    const event: DiagnosticEvent = {
      occurredAt: this.clock.now().toISOString(),
      type: input.type,
      outcome: input.outcome,
      subjectId: input.subjectId,
      durationMs: input.durationMs,
      errorCode: input.errorCode,
    };

    // FR-094: a logging failure must never break ingestion, categorization,
    // alerting, or reporting. Count it and move on — the inverse of the
    // fail-loudly rule for encryption, because a missing log entry compromises
    // nothing while a lost transaction is a correctness bug.
    try {
      this.sink.write(event);
    } catch {
      this.#dropped += 1;
    }
  }
}
