import { describe, it, expect } from 'vitest';
import { evaluateAlerts, dedupeKeyFor, AlertType } from '@main/analysis/alerts';
import type { AlertRule, AlertCandidate } from '@main/analysis/alerts';

const RULES: AlertRule[] = [
  { id: 'r1', type: AlertType.LargePurchase, thresholdMinor: 20000, windowMinutes: null, enabled: true },
  { id: 'r2', type: AlertType.DailyTotal, thresholdMinor: 15000, windowMinutes: null, enabled: true },
  { id: 'r3', type: AlertType.DuplicateCharge, thresholdMinor: null, windowMinutes: 1440, enabled: true },
];

function tx(over: Partial<AlertCandidate> = {}): AlertCandidate {
  return {
    transactionId: 'txn_001',
    amountMinor: -1000,
    merchantKey: 'target',
    occurredAt: new Date('2026-08-29T14:00:00Z'),
    isInternalTransfer: false,
    ...over,
  };
}

describe('alerts: large purchase', () => {
  it('fires above the threshold', () => {
    const a = evaluateAlerts([tx({ amountMinor: -25000, transactionId: 'txn_a' })], RULES, []);
    expect(a.map((x) => x.type)).toContain(AlertType.LargePurchase);
  });

  it('does NOT fire one cent under the threshold', () => {
    const a = evaluateAlerts([tx({ amountMinor: -19999, transactionId: 'txn_b' })], RULES, []);
    expect(a.map((x) => x.type)).not.toContain(AlertType.LargePurchase);
  });

  it('does not fire on money coming in', () => {
    const a = evaluateAlerts([tx({ amountMinor: 500000, transactionId: 'txn_c' })], RULES, []);
    expect(a).toHaveLength(0);
  });

  it('ignores internal transfers', () => {
    const a = evaluateAlerts(
      [tx({ amountMinor: -900000, transactionId: 'txn_d', isInternalTransfer: true })],
      RULES,
      [],
    );
    expect(a).toHaveLength(0);
  });
});

describe('alerts: daily total', () => {
  it('fires once when the day crosses the threshold', () => {
    const day = [
      tx({ transactionId: 'txn_1', amountMinor: -8000, merchantKey: 'a' }),
      tx({ transactionId: 'txn_2', amountMinor: -8000, merchantKey: 'b' }),
      tx({ transactionId: 'txn_3', amountMinor: -8000, merchantKey: 'c' }),
    ];
    const daily = evaluateAlerts(day, RULES, []).filter((a) => a.type === AlertType.DailyTotal);
    expect(daily).toHaveLength(1);
  });

  it('does not fire just under the threshold', () => {
    const day = [
      tx({ transactionId: 'txn_1', amountMinor: -7000, merchantKey: 'a' }),
      tx({ transactionId: 'txn_2', amountMinor: -7999, merchantKey: 'b' }),
    ];
    expect(evaluateAlerts(day, RULES, []).filter((a) => a.type === AlertType.DailyTotal)).toHaveLength(0);
  });

  it('scopes totals per calendar day, not across the whole batch', () => {
    const spread = [
      tx({ transactionId: 'txn_1', amountMinor: -14000, occurredAt: new Date('2026-08-28T14:00:00Z') }),
      tx({ transactionId: 'txn_2', amountMinor: -14000, occurredAt: new Date('2026-08-29T14:00:00Z') }),
    ];
    expect(evaluateAlerts(spread, RULES, []).filter((a) => a.type === AlertType.DailyTotal)).toHaveLength(0);
  });
});

describe('alerts: duplicate charge', () => {
  it('fires on same merchant and amount within the window', () => {
    const pair = [
      tx({ transactionId: 'txn_1', amountMinor: -4382, occurredAt: new Date('2026-08-29T12:00:00Z') }),
      tx({ transactionId: 'txn_2', amountMinor: -4382, occurredAt: new Date('2026-08-29T12:20:00Z') }),
    ];
    expect(evaluateAlerts(pair, RULES, []).filter((a) => a.type === AlertType.DuplicateCharge)).toHaveLength(1);
  });

  it('does not fire outside the window', () => {
    const pair = [
      tx({ transactionId: 'txn_1', amountMinor: -4382, occurredAt: new Date('2026-08-27T12:00:00Z') }),
      tx({ transactionId: 'txn_2', amountMinor: -4382, occurredAt: new Date('2026-08-29T12:00:00Z') }),
    ];
    expect(evaluateAlerts(pair, RULES, []).filter((a) => a.type === AlertType.DuplicateCharge)).toHaveLength(0);
  });

  it('does not fire for different amounts at the same merchant', () => {
    const pair = [
      tx({ transactionId: 'txn_1', amountMinor: -4382 }),
      tx({ transactionId: 'txn_2', amountMinor: -4383 }),
    ];
    expect(evaluateAlerts(pair, RULES, []).filter((a) => a.type === AlertType.DuplicateCharge)).toHaveLength(0);
  });
});

describe('alerts: deduplication is deterministic (FR-031)', () => {
  it('produces a stable dedupe key for the same underlying event', () => {
    const k1 = dedupeKeyFor(AlertType.DailyTotal, '2026-08-29');
    const k2 = dedupeKeyFor(AlertType.DailyTotal, '2026-08-29');
    expect(k1).toBe(k2);
    expect(k1).not.toBe(dedupeKeyFor(AlertType.DailyTotal, '2026-08-30'));
  });

  it('suppresses an alert whose key was already emitted — the replay case', () => {
    const batch = [tx({ transactionId: 'txn_a', amountMinor: -25000 })];
    const first = evaluateAlerts(batch, RULES, []);
    expect(first).toHaveLength(1);
    // Re-ingesting the same data (catch-up replay) must produce nothing new.
    const second = evaluateAlerts(batch, RULES, first.map((a) => a.dedupeKey));
    expect(second).toHaveLength(0);
  });

  it('emits one alert when a single event satisfies several rules', () => {
    // One purchase over both the single-purchase and daily thresholds.
    const single = [tx({ transactionId: 'txn_big', amountMinor: -30000 })];
    const fired = evaluateAlerts(single, RULES, []);
    expect(fired).toHaveLength(1);
    expect(fired[0]?.type).toBe(AlertType.LargePurchase);
  });

  it('respects disabled rules', () => {
    const disabled = RULES.map((r) => ({ ...r, enabled: false }));
    expect(evaluateAlerts([tx({ amountMinor: -99999 })], disabled, [])).toHaveLength(0);
  });
});

describe('alerts: backlog carries true event time (FR-057)', () => {
  it('reports when the event happened, not when it was detected', () => {
    const old = new Date('2026-08-01T10:30:00Z');
    const fired = evaluateAlerts([tx({ transactionId: 'txn_old', amountMinor: -25000, occurredAt: old })], RULES, []);
    expect(fired[0]?.eventOccurredAt.toISOString()).toBe(old.toISOString());
  });
});
