import { useState } from 'react';
import { useQuery, call } from '../lib/ipc';
import { EmptyState } from '../components/EmptyState';
import type { AlertView } from '@shared/types';

interface AlertRuleView {
  readonly id: string;
  readonly type: string;
  readonly label: string | null;
  readonly thresholdMinor: number | null;
  readonly windowMinutes: number | null;
  readonly enabled: boolean;
  readonly isSystem: boolean;
}

const RULE_TYPES = [
  { id: 'large_purchase', label: 'A single purchase over an amount', needs: 'threshold' },
  { id: 'daily_total', label: 'A day of spending over an amount', needs: 'threshold' },
  { id: 'duplicate_charge', label: 'The same charge twice within a window', needs: 'window' },
  { id: 'new_recurring', label: 'A new recurring charge appears', needs: 'none' },
  { id: 'balance_floor', label: 'Balance projected below an amount', needs: 'threshold' },
] as const;

/** Editable rule row: threshold, window, name, on/off, delete. */
function RuleRow({ rule, onChanged }: { rule: AlertRuleView; onChanged: () => void }): React.JSX.Element {
  const [threshold, setThreshold] = useState(
    rule.thresholdMinor === null ? '' : String(rule.thresholdMinor / 100),
  );
  const [windowMinutes, setWindowMinutes] = useState(
    rule.windowMinutes === null ? '' : String(rule.windowMinutes),
  );
  const [label, setLabel] = useState(rule.label ?? '');

  const save = (patch: Record<string, unknown>): void => {
    void call('alertRules:update', { id: rule.id, ...patch });
  };
  const spec = RULE_TYPES.find((r) => r.id === rule.type);

  return (
    <li className="space-y-2 bg-[var(--color-surface)] px-4 py-3 text-[13px]">
      <div className="flex items-center gap-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => save({ label: label.trim() || null })}
          placeholder={spec?.label ?? rule.type}
          aria-label={`Name for ${spec?.label ?? rule.type}`}
          className="flex-1 border border-transparent bg-transparent px-1 py-0.5 outline-none hover:border-[var(--color-line)] focus:border-[var(--color-line)]"
        />
        <label className="flex items-center gap-2 text-[12px] text-[var(--color-ink-faint)]">
          <input
            type="checkbox"
            defaultChecked={rule.enabled}
            onChange={(e) => save({ enabled: e.target.checked })}
          />
          On
        </label>
        {!rule.isSystem && (
          <button
            type="button"
            onClick={() => {
              void call('alertRules:delete', { id: rule.id }).then(onChanged);
            }}
            className="text-[12px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          >
            Delete
          </button>
        )}
      </div>

      <div className="flex items-center gap-4 text-[12px] text-[var(--color-ink-faint)]">
        <span>{spec?.label ?? rule.type}</span>
        {spec?.needs === 'threshold' && (
          <label className="flex items-center gap-2">
            Amount $
            <input
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              onBlur={() =>
                save({ thresholdMinor: threshold ? Math.round(Number(threshold) * 100) : null })
              }
              inputMode="decimal"
              aria-label={`Threshold for ${spec.label}`}
              className="numeric w-24 border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[var(--color-ink)] outline-none"
            />
          </label>
        )}
        {spec?.needs === 'window' && (
          <label className="flex items-center gap-2">
            Within
            <input
              value={windowMinutes}
              onChange={(e) => setWindowMinutes(e.target.value)}
              onBlur={() => save({ windowMinutes: windowMinutes ? Number(windowMinutes) : null })}
              inputMode="numeric"
              aria-label={`Window for ${spec.label}`}
              className="numeric w-20 border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[var(--color-ink)] outline-none"
            />
            minutes
          </label>
        )}
      </div>
    </li>
  );
}

/** Add a rule, including a second one of a kind that already exists. */
function AddRule({ onCreated }: { onCreated: () => void }): React.JSX.Element {
  const [type, setType] = useState<string>('large_purchase');
  const [amount, setAmount] = useState('');
  const spec = RULE_TYPES.find((r) => r.id === type);

  return (
    <div className="flex flex-wrap items-center gap-2 border border-dashed border-[var(--color-line)] px-4 py-3 text-[13px]">
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        aria-label="New alert type"
        className="border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[12px]"
      >
        {RULE_TYPES.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      {spec?.needs !== 'none' && (
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={spec?.needs === 'window' ? 'minutes' : 'amount'}
          inputMode="decimal"
          aria-label="New alert value"
          className="numeric w-28 border border-[var(--color-line)] bg-[var(--color-ground)] px-2 py-1 text-[12px] outline-none"
        />
      )}
      <button
        type="button"
        onClick={() => {
          void call('alertRules:create', {
            type,
            ...(spec?.needs === 'threshold' && amount
              ? { thresholdMinor: Math.round(Number(amount) * 100) }
              : {}),
            ...(spec?.needs === 'window' && amount ? { windowMinutes: Number(amount) } : {}),
          }).then(onCreated);
          setAmount('');
        }}
        className="border border-[var(--color-line)] px-3 py-1 text-[12px] hover:bg-[var(--color-surface-raised)]"
      >
        Add alert
      </button>
    </div>
  );
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
            <RuleRow key={rule.id} rule={rule} onChanged={rules.refetch} />
          ))}
        </ul>
        <AddRule onCreated={rules.refetch} />
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
