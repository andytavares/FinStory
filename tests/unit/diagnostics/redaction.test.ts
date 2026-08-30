import { describe, it, expect, beforeEach } from 'vitest';
import { DiagnosticLogger, DiagnosticEventType, Outcome } from '@main/diagnostics/logger';
import { MemorySink } from '@main/diagnostics/sink';
import { TestClock } from '@shared/clock';

// Values that must NEVER appear in diagnostic output.
const FORBIDDEN = {
  merchant: 'Uber Eats',
  amountMinor: 4312,
  accountNumber: '4111111111111111',
  accessToken: 'access-sandbox-abc123',
  balance: 84700,
};

describe('diagnostics: redaction is structural, not filtered', () => {
  let clock: TestClock;
  let sink: MemorySink;
  let log: DiagnosticLogger;

  beforeEach(() => {
    clock = new TestClock(new Date('2026-08-29T12:00:00Z'));
    sink = new MemorySink();
    log = new DiagnosticLogger(sink, clock);
  });

  it('records an event with an opaque subject id', () => {
    log.record({
      type: DiagnosticEventType.SyncAttempt,
      outcome: Outcome.Success,
      subjectId: 'inst_01H8XYZ',
      durationMs: 412,
    });
    const [event] = sink.events;
    expect(event?.subjectId).toBe('inst_01H8XYZ');
    expect(event?.occurredAt).toBe('2026-08-29T12:00:00.000Z');
  });

  it('has no field capable of carrying a merchant name or amount', () => {
    log.record({
      type: DiagnosticEventType.Categorization,
      outcome: Outcome.Success,
      subjectId: 'txn_001',
    });
    const serialized = JSON.stringify(sink.events);
    for (const [label, value] of Object.entries(FORBIDDEN)) {
      expect(serialized, `leaked ${label}`).not.toContain(String(value));
    }
  });

  it('rejects a subject id that looks like free text rather than an identifier', () => {
    // The guard exists so a caller cannot smuggle a merchant name through subjectId.
    expect(() =>
      log.record({
        type: DiagnosticEventType.SyncAttempt,
        outcome: Outcome.Failure,
        subjectId: FORBIDDEN.merchant,
      }),
    ).toThrow(/opaque identifier/i);
  });

  it('rejects a subject id containing digits that could be an account number', () => {
    expect(() =>
      log.record({
        type: DiagnosticEventType.SyncAttempt,
        outcome: Outcome.Failure,
        subjectId: FORBIDDEN.accountNumber,
      }),
    ).toThrow(/opaque identifier/i);
  });

  it('constrains errorCode to an enumerated set rather than free-form messages', () => {
    expect(() =>
      log.record({
        type: DiagnosticEventType.SyncFailure,
        outcome: Outcome.Failure,
        subjectId: 'inst_01',
        // @ts-expect-error — proving the type system rejects free text here too
        errorCode: `Declined charge of $43.12 at ${FORBIDDEN.merchant}`,
      }),
    ).toThrow(/error code/i);
  });
});

describe('diagnostics: failures never break the pipeline (FR-094)', () => {
  it('swallows a sink failure and counts it instead of throwing', () => {
    const clock = new TestClock(new Date('2026-08-29T12:00:00Z'));
    const failing = {
      write(): void {
        throw new Error('disk full');
      },
    };
    const log = new DiagnosticLogger(failing, clock);

    expect(() =>
      log.record({
        type: DiagnosticEventType.SyncAttempt,
        outcome: Outcome.Success,
        subjectId: 'inst_01',
      }),
    ).not.toThrow();

    expect(log.droppedEventCount).toBe(1);
  });
});
