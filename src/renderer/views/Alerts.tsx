import { useQuery, call } from '../lib/ipc';
import { Money } from '../components/Money';
import { EmptyState } from '../components/EmptyState';
import type { AlertView } from '@shared/types';

interface AlertRuleView {
  readonly id: string;
  readonly type: string;
  readonly thresholdMinor: number | null;
  readonly windowMinutes: number | null;
  readonly enabled: boolean;
}

const RULE_LABELS: Record<string, string> = {
  large_purchase: 'Any single purchase over',
  daily_total: 'Total spending in a day over',
  duplicate_charge: 'Same merchant and amount within',
  new_recurring: 'A new recurring charge is detected',
  balance_floor: 'Balance projected to fall below',
};

/** FR-032, FR-033: alert history, and per-rule configuration. */
export function Alerts(): React.JSX.Element {
  const alerts = useQuery<AlertView[]>('alerts:list', { includeDismissed: true, limit: 100 });
  const rules = useQuery<AlertRuleView[]>('alertRules:list');

  return (
    <div className="space-y-8">
      <h1 className="text-[20px]">Alerts</h1>

      <section className="space-y-3">
        <p className="eyebrow">What you get told about</p>
        <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
          {(rules.data ?? []).map((rule) => (
            <li
              key={rule.id}
              className="flex items-center gap-4 bg-[var(--color-surface)] px-4 py-3 text-[13px]"
            >
              <span className="flex-1">
                {RULE_LABELS[rule.type] ?? rule.type}
                {rule.thresholdMinor !== null && (
                  <>
                    {' '}
                    <Money minor={rule.thresholdMinor} magnitude />
                  </>
                )}
                {rule.windowMinutes !== null && (
                  <span className="numeric"> {rule.windowMinutes} min</span>
                )}
              </span>
              <label className="flex items-center gap-2 text-[12px] text-[var(--color-ink-faint)]">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) =>
                    void call('alertRules:update', { id: rule.id, enabled: e.target.checked })
                  }
                />
                On
              </label>
            </li>
          ))}
        </ul>
        {(rules.data ?? []).length === 0 && (
          <p className="text-[12px] text-[var(--color-ink-faint)]">
            Alert rules appear once an account is connected.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <p className="eyebrow">Recent</p>
        {alerts.loading && <p className="text-[var(--color-ink-faint)]">Loading…</p>}
        {alerts.data && alerts.data.length === 0 && (
          <EmptyState
            title="Nothing has needed your attention"
            detail="Large purchases, duplicate charges, and new subscriptions show up here as they happen."
          />
        )}
        {alerts.data && alerts.data.length > 0 && (
          <ul className="divide-y divide-[var(--color-line)] border border-[var(--color-line)]">
            {alerts.data.map((a) => {
              // Both times are shown, so a replayed alert is never mistaken for
              // a live one (FR-057).
              const late =
                new Date(a.detectedAt).getTime() - new Date(a.eventOccurredAt).getTime() >
                60 * 60 * 1000;
              return (
                <li
                  key={a.id}
                  className={`flex items-center gap-4 bg-[var(--color-surface)] px-4 py-3 text-[13px] ${
                    a.dismissed ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex-1">
                    <p>{RULE_LABELS[a.type] ?? a.type}</p>
                    <p className="text-[12px] text-[var(--color-ink-faint)]">
                      Happened {new Date(a.eventOccurredAt).toLocaleString()}
                      {late && ' · detected later, while Money was closed'}
                    </p>
                  </div>
                  {!a.dismissed && (
                    <button
                      type="button"
                      onClick={() => void call('alerts:dismiss', { alertId: a.id })}
                      className="text-[12px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
                    >
                      Not a problem
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
