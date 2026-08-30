import { describe, it, expect } from 'vitest';
import { buildExport, summarizeHealth } from '@main/diagnostics/export';
import { DiagnosticEventType, Outcome, ErrorCode } from '@main/diagnostics/logger';
import type { DiagnosticEvent } from '@main/diagnostics/logger';

/** Known fixture values that must never appear in an export (SC-023). */
const SECRETS = {
  merchant: 'Uber Eats',
  merchant2: 'Trader Joes',
  amount: '43.12',
  amountMinor: '4312',
  balance: '84700',
  account: '4111111111111111',
  token: 'access-sandbox-abc123',
  apiKey: 'sk-ant-api03-secret',
};

const events: DiagnosticEvent[] = [
  {
    occurredAt: '2026-08-29T12:00:00.000Z',
    type: DiagnosticEventType.SyncAttempt,
    outcome: Outcome.Success,
    subjectId: 'inst_01H8XYZ',
    durationMs: 412,
    errorCode: undefined,
  },
  {
    occurredAt: '2026-08-29T12:05:00.000Z',
    type: DiagnosticEventType.SyncFailure,
    outcome: Outcome.Failure,
    subjectId: 'inst_02ABC',
    durationMs: 30_000,
    errorCode: ErrorCode.ReauthRequired,
  },
];

describe('diagnostic export is redacted by construction (FR-091, SC-023)', () => {
  const output = JSON.stringify(buildExport(events, { droppedEventCount: 3 }));

  it('contains zero merchant names', () => {
    expect(output).not.toContain(SECRETS.merchant);
    expect(output).not.toContain(SECRETS.merchant2);
  });

  it('contains zero transaction amounts or balances', () => {
    expect(output).not.toContain(SECRETS.amount);
    expect(output).not.toContain(SECRETS.amountMinor);
    expect(output).not.toContain(SECRETS.balance);
  });

  it('contains zero account numbers or credentials', () => {
    expect(output).not.toContain(SECRETS.account);
    expect(output).not.toContain(SECRETS.token);
    expect(output).not.toContain(SECRETS.apiKey);
  });

  it('still contains enough to diagnose a failure (SC-024)', () => {
    expect(output).toContain('reauth_required');
    expect(output).toContain('inst_02ABC');
  });

  it('reports dropped events so silent loss is visible', () => {
    expect(buildExport(events, { droppedEventCount: 3 }).droppedEventCount).toBe(3);
  });
});

describe('health summary (FR-088, FR-092)', () => {
  it('counts recent failures per subject', () => {
    const h = summarizeHealth(events);
    expect(h.failuresBySubject['inst_02ABC']).toBe(1);
    expect(h.failuresBySubject['inst_01H8XYZ']).toBeUndefined();
  });

  it('reports the last successful sync per subject', () => {
    expect(summarizeHealth(events).lastSuccessBySubject['inst_01H8XYZ']).toBe(
      '2026-08-29T12:00:00.000Z',
    );
  });

  it('flags a subject as degraded past the failure threshold (FR-092)', () => {
    const many: DiagnosticEvent[] = Array.from({ length: 5 }, (_, i) => ({
      occurredAt: `2026-08-29T1${i}:00:00.000Z`,
      type: DiagnosticEventType.SyncFailure,
      outcome: Outcome.Failure,
      subjectId: 'inst_bad',
      durationMs: 100,
      errorCode: ErrorCode.Network,
    }));
    expect(summarizeHealth(many, { degradedAfterFailures: 3 }).degradedSubjects).toContain('inst_bad');
  });

  it('does not flag a subject below the threshold', () => {
    expect(summarizeHealth(events, { degradedAfterFailures: 3 }).degradedSubjects).toHaveLength(0);
  });
});

describe('log rotation is bounded (FR-093)', () => {
  it('drops events older than the age limit', async () => {
    const { rotate, MAX_AGE_DAYS } = await import('@main/diagnostics/rotation');
    const old = {
      occurredAt: new Date(Date.UTC(2020, 0, 1)).toISOString(),
      type: DiagnosticEventType.SyncAttempt,
      outcome: Outcome.Success,
      subjectId: 'inst_old',
      durationMs: 1,
      errorCode: undefined,
    };
    const r = rotate([old, ...events], new Date('2026-08-29T12:00:00Z'));
    expect(r.retained).toHaveLength(2);
    expect(r.dropped).toBe(1);
    expect(MAX_AGE_DAYS).toBeGreaterThan(0);
  });

  it('caps total event count', async () => {
    const { rotate, MAX_EVENTS } = await import('@main/diagnostics/rotation');
    const many = Array.from({ length: MAX_EVENTS + 500 }, () => events[0]!);
    expect(rotate(many, new Date('2026-08-29T12:00:00Z')).retained).toHaveLength(MAX_EVENTS);
  });
});
